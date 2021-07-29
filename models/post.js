const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const postSchema = new Schema({
    title: {
        type: String
    },
    body: {
        type: String
    },
    image: {
        type: String,
    },
    status: {
        type: String
    },
    postUser: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    date: {
        type: Date,
        default: Date.now
    },
    allowComments: {
        type: Boolean,
        default: false
    },
    comments: [{
        commentUser: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        commentBody: {
            type: String
        },
        date: {
            type: Date,
            default: Date.now
        }
    }],
    likes: [{
        likeUser: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        date: {
            type: Date,
            default: Date.now
        }
    }],
    icon: {
        type: String
    }
});

module.exports = mongoose.model('Post', postSchema);