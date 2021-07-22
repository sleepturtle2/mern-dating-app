const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const chatSchema = new Schema({
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    senderRead: {
        type: Boolean,
        default: false
    },
    received: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    receivedRead: {
        type: Boolean,
        default: false
    },
    date: {
        type: Date,
        default: Date.now
    },
    chats: [{
        senderName: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        senderMessage: {
            type: String
        },
        senderRead: {
            type: Boolean,
            default: false
        },
        receiverName: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        receiverMessage: {
            type: String
        },
        receiverRead: {
            type: Boolean,
            default: false
        },
        date: {
            type: Date,
            default: Date.now
        }
    }]
});

module.exports = mongoose.model('Chat', chatSchema);