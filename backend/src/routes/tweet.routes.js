import { Router } from "express";
import {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
} from "../controllers/tweet.controllers.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

const router = Router();

// All tweet routes require authentication
router.use(verifyJWT);

// ─────────────────────────────────────────────
// /api/v1/tweets
// ─────────────────────────────────────────────

router.route("/")
    .post(createTweet);             // POST /tweets — create a new tweet

router.route("/user/:userId")
    .get(getUserTweets);            // GET  /tweets/user/:userId — get all tweets by a user

router.route("/:tweetId")
    .patch(updateTweet)             // PATCH  /tweets/:tweetId — update tweet content
    .delete(deleteTweet);           // DELETE /tweets/:tweetId — delete a tweet

export default router;