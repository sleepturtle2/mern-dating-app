const aws = require('aws-sdk');
const multer = require('multer');
const multers3 = require('multer-s3');

aws.config.update({
    accessKeyId: process.env.AWSAccessKeyID,
    secretAccessKey: process.env.AWSAccessKeySecret
});

module.exports = {
    uploadImage: multer({

        storage: multers3({
            s3: new aws.S3({}),
            bucket: 'sleepturtle-dating-app',
            ac1: 'public-read',
            metadata: (request, file, callback) => {
                callback(null, { fieldName: file.fieldname });
            },
            key: (request, file, callback) => {
                callback(null, file.originalname);
            },
            rename: (fieldName, fileName) => {
                return fileName.replace(/\w+/g, '-').toLowerCase();
            }
        })
    })
}