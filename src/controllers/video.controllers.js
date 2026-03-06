import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.models.js";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";


// ─────────────────────────────────────────────
// GET ALL VIDEOS (with search, sort, pagination)
// ─────────────────────────────────────────────
const getAllVideos = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        query,           // search term matched against title and description
        sortBy = "createdAt",
        sortType = "desc",
        userId           // optionally filter videos by a specific owner
    } = req.query;

    const pipeline = [];

    // 1. Filter by owner if userId is provided
    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId!");
        }
        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        });
    }

    // 2. Full-text search on title and description
    if (query) {
        pipeline.push({
            $match: {
                $or: [
                    { title: { $regex: query, $options: "i" } },
                    { description: { $regex: query, $options: "i" } }
                ]
            }
        });
    }

    // 3. Only return published videos
    pipeline.push({
        $match: { isPublished: true }
    });

    // 4. Lookup owner details
    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullname: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                owner: { $first: "$ownerDetails" }
            }
        }
    );

    // 5. Sort
    const sortOrder = sortType === "asc" ? 1 : -1;
    pipeline.push({
        $sort: { [sortBy]: sortOrder }
    });

    // 6. Remove raw lookup array from output
    pipeline.push({
        $project: {
            ownerDetails: 0,
            videoFilePublicId: 0, // don't expose internal public_ids to the client
            thumbnailPublicId: 0
        }
    });

    // 7. Paginate using mongoose-aggregate-paginate-v2
    const options = {
        page: parseInt(page),
        limit: parseInt(limit)
    };

    const videos = await Video.aggregatePaginate(
        Video.aggregate(pipeline),
        options
    );

    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Videos fetched successfully!"));
});


// ─────────────────────────────────────────────
// PUBLISH A VIDEO
// ─────────────────────────────────────────────
const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;

    if (!title?.trim() || !description?.trim()) {
        throw new ApiError(400, "Title and description are required!");
    }

    // Get local file paths set by multer
    const videoLocalPath = req.files?.videoFile?.[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!videoLocalPath) {
        throw new ApiError(400, "Video file is required!");
    }
    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail is required!");
    }

    // Upload video to Cloudinary
    let videoFile;
    try {
        videoFile = await uploadOnCloudinary(videoLocalPath);
        if (!videoFile) throw new Error();
    } catch (error) {
        throw new ApiError(500, "Failed to upload video file!");
    }

    // Upload thumbnail to Cloudinary
    let thumbnail;
    try {
        thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
        if (!thumbnail) throw new Error();
    } catch (error) {
        // Rollback video upload if thumbnail fails
        await deleteFromCloudinary(videoFile.public_id, "video");
        throw new ApiError(500, "Failed to upload thumbnail!");
    }

    // Save video document to DB
    try {
        const video = await Video.create({
            videoFile: videoFile.url,
            videoFilePublicId: videoFile.public_id,  // store for reliable deletion later
            thumbnail: thumbnail.url,
            thumbnailPublicId: thumbnail.public_id,  // store for reliable deletion later
            title,
            description,
            duration: videoFile.duration, // Cloudinary returns duration for video files
            owner: req.user._id,
            isPublished: true
        });

        return res
            .status(201)
            .json(new ApiResponse(201, video, "Video published successfully!"));
    } catch (error) {
        // Rollback both Cloudinary uploads if DB write fails
        await deleteFromCloudinary(videoFile.public_id, "video");
        await deleteFromCloudinary(thumbnail.public_id);
        throw new ApiError(500, "Something went wrong while publishing the video!");
    }
});


// ─────────────────────────────────────────────
// GET VIDEO BY ID
// ─────────────────────────────────────────────
const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId!");
    }

    // Aggregation to fetch video with owner info in one query
    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullname: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                owner: { $first: "$owner" }
            }
        },
        {
            $project: {
                videoFilePublicId: 0, // don't expose internal public_ids to the client
                thumbnailPublicId: 0
            }
        }
    ]);

    if (!video.length) {
        throw new ApiError(404, "Video not found!");
    }

    // Increment view count
    await Video.findByIdAndUpdate(videoId, {
        $inc: { views: 1 }
    });

    // Add to the user's watch history (addToSet avoids duplicates)
    await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { watchHistory: videoId } // addToSet only adds the item if it already does not exist.
    });

    return res
        .status(200)
        .json(new ApiResponse(200, video[0], "Video fetched successfully!"));
});


// ─────────────────────────────────────────────
// UPDATE VIDEO (title, description, thumbnail)
// ─────────────────────────────────────────────
const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { title, description } = req.body;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId!");
    }

    if (!title?.trim() && !description?.trim() && !req.file) {
        throw new ApiError(400, "At least one field (title, description, thumbnail) is required to update!");
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found!");
    }

    // Only the owner can update
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this video!");
    }

    // Handle thumbnail update
    let newThumbnailUrl = video.thumbnail;// Store the thumbnail and its publicId.
    let newThumbnailPublicId = video.thumbnailPublicId;

    if (req.file) {
        const thumbnailLocalPath = req.file.path;

        const uploadedThumbnail = await uploadOnCloudinary(thumbnailLocalPath);
        if (!uploadedThumbnail?.url) {
            throw new ApiError(500, "Failed to upload new thumbnail!");
        }

        // Delete old thumbnail from Cloudinary using stored public_id
        await deleteFromCloudinary(video.thumbnailPublicId);// We are getting the old public Id here fro schema.

        newThumbnailUrl = uploadedThumbnail.url;
        newThumbnailPublicId = uploadedThumbnail.public_id;
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                title: title?.trim() || video.title,
                description: description?.trim() || video.description,
                thumbnail: newThumbnailUrl,
                thumbnailPublicId: newThumbnailPublicId
            }
        },
        { new: true }
    ).select("-videoFilePublicId -thumbnailPublicId"); // don't expose public_ids

    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, "Video updated successfully!"));
});


// ─────────────────────────────────────────────
// DELETE VIDEO
// ─────────────────────────────────────────────
const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId!");
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found!");
    }

    // Only the owner can delete
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this video!");
    }

    // Delete from Cloudinary using stored public_ids (reliable regardless of folder structure)
    await deleteFromCloudinary(video.videoFilePublicId, "video");
    await deleteFromCloudinary(video.thumbnailPublicId);

    // Delete from DB
    await Video.findByIdAndDelete(videoId);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully!"));
});


// ─────────────────────────────────────────────
// TOGGLE PUBLISH STATUS
// ─────────────────────────────────────────────
const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId!");
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found!");
    }

    // Only the owner can toggle publish status
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to perform this action!");
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                isPublished: !video.isPublished
            }
        },
        { new: true }
    );

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            { isPublished: updatedVideo.isPublished },
            `Video is now ${updatedVideo.isPublished ? "published" : "unpublished"}!`
        ));
});


export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
};