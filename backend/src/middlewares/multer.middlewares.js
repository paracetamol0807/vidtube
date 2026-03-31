import multer from "multer";

// The purpose of this Multer storage code is to save user-uploaded files on disk with unique filenames so they don’t overwrite each other.

const storage = multer.diskStorage({// This tells multer to store files on disc(not memory).
  destination: function (req, file, cb) {
    cb(null, './public/temp')
  },
  filename: function (req, file, cb) { /*This decides what name the file will get in the temp folder. */
    //const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) // This is used when we want to generate a unique suffix.
    cb(null, file.originalname) // originalname is the name of the file on user's computer. And we are doing this becoz we don't want to loose the original file extension.
  }
})



/*Another alternate code that may be able to achieve that is:- */

/*const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp/my-uploads')
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname); // .jpg, .png
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueName + ext);
  }
})

const upload = multer({ storage: storage }) */

// The first code is more dangerous because there if two users upload files with same name then one of the files will get over written

export const upload = multer({
  storage
})