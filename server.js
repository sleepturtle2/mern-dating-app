require('dotenv').config();
const express = require('express');
const Handlebars = require('handlebars');
const hbs = require('express-handlebars');
const { allowInsecurePrototypeAccess } = require('@handlebars/allow-prototype-access');
const passport = require('passport');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const formidable = require('formidable');


//load stripe module
const stripe = require('stripe')(process.env.StripeSecretKey);


//Load models
const Message = require('./models/message');
const User = require('./models/user');
const Chat = require('./models/chat');
const Smile = require('./models/smile');
const Post = require('./models/post');

const app = express();

//use body parser middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//load helpers
const { requireLogin, ensureGuest } = require('./helpers/auth');
const { getLastMoment } = require('./helpers/moment');
const { uploadImage } = require('./helpers/aws');
const { walletChecker } = require('./helpers/wallet');


//configuration for authentication
app.use(cookieParser());
app.use(session({
    secret: 'mysecret',
    resave: true,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use((request, response, next) => {
    response.locals.success_msg = request.flash('success_msg');
    response.locals.error_msg = request.flash('error_msg');
    response.locals.error = request.flash('error');
    next();
});

//setup express static folder to serve js, css files
app.use(express.static('public'));

//make user global object
app.use((request, response, next) => {
    //console.log(response.locals);
    response.locals.user = request.user || null;
    next();
})

//load facebook strategy
require('./passport/facebook');
//load google strategy
require('./passport/google');
require('./passport/local');

//connect to mLab MongoDB
mongoose.connect(process.env.MongoDB, { useNewUrlParser: true, useUnifiedTopology: true }).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.log(error);
});

//environment variable for port
const port = process.env.PORT || 3000;

/*allowInsecurePrototypeAccess has been added to revert back to a version after handlebars updates*/
//setup view engine
app.engine('handlebars', hbs({
    handlebars: allowInsecurePrototypeAccess(Handlebars),
    helpers: {
        getLastMoment: getLastMoment
    }
}));
app.set('view engine', 'handlebars');

app.get('/', ensureGuest, (request, response) => {
    response.render('home', {
        title: 'Home'
    });
});

app.get('/about', ensureGuest, (request, response) => {
    response.render('about', {
        title: 'About'
    });
});

app.get('/contact', ensureGuest, (request, response) => {
    response.render('contact', {
        title: 'Contact'
    });
});


//facebook route handling
app.get('/auth/facebook', passport.authenticate('facebook', {
    scope: ['email']
}));
app.get('/auth/facebook/callback', passport.authenticate('facebook', {
    successRedirect: '/profile',
    failureRedirect: '/'
}));

//google route handling
app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile']

}));
app.get('/auth/google/callback', passport.authenticate('google', {
    successRedirect: '/profile',
    failureRedirect: '/'
}));


//requireLogin here
app.get('/profile', (request, response) => {
    User.findById({ _id: request.user._id }).then((user) => {

        if (user) {
            //console.log(user);
            user.online = true;
            user.save((error, user) => {
                if (error) {
                    throw error;
                } else {
                    Smile.findOne({ receiver: request.user._id, receiverReceived: false })
                        .then((newSmile) => {
                            Chat.findOne({
                                    $or: [
                                        { receiver: request.user._id, receiverRead: false },
                                        { sender: request.user._id, senderRead: false }
                                    ]
                                })
                                .then((unread) => {
                                    Post.find({ postUser: request.user._id })
                                        .populate('postUser')
                                        .sort({ date: 'desc' })
                                        .then((posts) => {
                                            if (posts) {
                                                response.render('profile', {
                                                    title: 'Profile',
                                                    user: user,
                                                    newSmile: newSmile,
                                                    unread: unread,
                                                    posts: posts
                                                })

                                            } else {
                                                console.log('no user posts');
                                                response.render('profile', {
                                                    title: 'Profile',
                                                    user: user,
                                                    newSmile: newSmile,
                                                    unread: unread
                                                })

                                            }
                                        })
                                })

                        })
                }
            })
        }
    })
})


//requireLogin here
app.post('/updateProfile', (request, response) => {
    User.findById({ _id: request.user._id })
        .then((user) => {
            user.fullname = request.body.fullname;
            user.email = request.body.email;
            user.gender = request.body.gender;
            user.about = request.body.about;
            user.save(() => {
                response.redirect('/profile');
            });
        });
});


//requireLogin here
app.get('/askToDelete', (request, response) => {
    response.render('askToDelete', {
        title: 'Delete'
    });
});


//requireLogin here
app.get('/deleteAccount', (request, response) => {
    User.deleteOne({ _id: request.user._id })
        .then(() => {
            response.render('accountDeleted', {
                title: 'Deleted'
            });
        });
});



app.get('/newAccount', (request, response) => {
    response.render('newAccount', {
        title: 'Signup'
    });
});




app.post('/signup', (request, response) => {
    //console.log(request.body);
    let errors = [];

    if (request.body.password !== request.body.password2) {
        errors.push({ text: 'Passwords do not match' });
    }
    if (request.body.password.length < 5) {
        errors.push({ text: 'Password must be at least 5 characters' });
    }
    if (errors.length > 0) {
        response.render('newAccount', {
            errors: errors,
            title: 'Error',
            fullname: request.body.username,
            email: request.body.email,
            password: request.body.password,
            password2: request.body.password2
        });
    } else {
        User.findOne({ email: request.body.email })
            .then((user) => {
                if (user) {
                    let errors = [];
                    errors.push({ text: 'Email already exists' });
                    response.render('newAccount', {
                        title: 'Signup',
                        errors: errors
                    })
                } else {
                    var salt = bcrypt.genSaltSync(10);
                    var hash = bcrypt.hashSync(request.body.password, salt);

                    const newUser = {
                        fullname: request.body.username,
                        email: request.body.email,
                        password: hash
                    }

                    new User(newUser).save((error, user) => {
                        if (error) {
                            throw error;
                        }
                        if (user) {
                            let success = [];
                            success.push({ text: 'Account created successfully. You can login now' });
                            response.render('home', {
                                success: success
                            });
                        }
                    })
                }
            })
    }

});



//get route to handle users
app.use('/singles', (request, response) => {
    User.find({})
        .sort({ date: 'desc' })
        .then((singles) => {
            response.render('singles', {
                title: 'Singles',
                singles: singles
            })
        }).catch((error) => {
            console.log(error);
        })
})


//requirelogin here
app.get('/userProfile/:id', (request, response) => {
    User.findById({ _id: request.params.id })
        .then((user) => {
            Smile.findOne({ receiver: request.params.id })
                .then((smile) => {
                    Post.find({ status: 'public', postUser: user._id })
                        .populate('postUser')
                        .populate('likes.likeUser')
                        .populate('comments.commentUser')
                        .then((publicPosts) => {

                            response.render('userProfile', {
                                title: 'Profile',
                                oneUser: user,
                                smile: smile,
                                publicPosts: publicPosts
                            });
                        })
                });
        });
});


app.post('/login', passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: 'loginErrors'
}));

app.get('/loginErrors', (request, response) => {
    let errors = [];
    errors.push({ text: 'User not found or Password incorrect' });
    response.render('home', {
        errors: errors
    });
});



//start chat process
//requireLogin here
app.get('/startChat/:id', (request, response) => {
    Chat.findOne({ sender: request.params.id, receiver: request.user._id })
        .then((chat) => {
            if (chat) {
                chat.receiverRead = true;
                chat.senderRead = false;
                chat.date = new Date();
                chat.save((error, chat) => {
                    if (error) {
                        throw error;
                    }
                    if (chat) {
                        response.redirect(`/chat/${chat._id}`)
                    }
                })
            } else {
                Chat.findOne({ sender: request.user._id, receiver: request.params.id })
                    .then((chat) => {

                        if (chat) {
                            chat.senderRead = true;
                            chat.receiverRead = false;
                            chat.date = new Date();
                            chat.save((error, chat) => {
                                if (error) {
                                    throw error;
                                }
                                if (chat) {
                                    response.redirect(`/chat/${chat._id}`);
                                }
                            })
                        } else {
                            const newChat = {
                                sender: request.user._id,
                                receiver: request.params.id,
                                senderRead: true,
                                receiverRead: false,
                                date: new Date()
                            }

                            new Chat(newChat).save((error, chat) => {
                                if (error) {
                                    throw error;
                                }
                                if (chat) {
                                    response.redirect(`/chat/${chat._id}`)
                                }
                            })
                        }
                    })
            }
        })
})

//Display Chat Room
//requireLogin here
app.get('/chat/:id', (request, response) => {
    Chat.findById({ _id: request.params.id })
        .sort({ date: 'desc' })
        .populate('sender')
        .populate('receiver')
        .populate('chats.senderName')
        .populate('chats.receiverName')
        .then((chat) => {
            User.findOne({ _id: request.user._id })
                .then((user) => {
                    response.render('chatRoom', {
                        title: 'ChatRoom',
                        user: user,
                        chat: chat
                    })
                })
        })
})


//requireLogin here
app.post('/chat/:id', walletChecker, (request, response) => {
    Chat.findOne({ _id: request.params.id, sender: request.user._id })
        .sort({ date: 'desc' })
        .populate('sender')
        .populate('receiver')
        .populate('chats.senderName')
        .populate('chats.receiverName')
        .then((chat) => {
            if (chat) {
                //sender sends message here
                chat.senderRead = true;
                chat.receiverRead = false;
                chat.date = new Date();

                const newChat = {
                    senderName: request.user._id,
                    senderRead: true,
                    receiverName: chat.receiver._id,
                    receiverRead: false,
                    date: new Date(),
                    senderMessage: request.body.chat
                }

                chat.chats.push(newChat);
                chat.save((error, chat) => {
                    if (error) {
                        throw error;
                    }
                    if (chat) {
                        Chat.findOne({ _id: chat._id })
                            .sort({ date: 'desc' })
                            .populate('sender')
                            .populate('receiver')
                            .populate('chats.senderName')
                            .populate('chats.receiverName')
                            .then((chat) => {
                                User.findById({ _id: request.user._id })
                                    .then((user) => {
                                        //we will charge client for each message
                                        user.wallet = user.wallet - 1;
                                        user.save((error, user) => {
                                            if (error) {
                                                throw error;
                                            }
                                            if (user) {
                                                response.render('chatRoom', {
                                                    title: 'Chat',
                                                    chat: chat,
                                                    user: user
                                                })
                                            }
                                        })
                                    })
                            })

                    }
                })

            } else {
                //receiver sends message back
                Chat.findOne({ _id: request.params.id, receiver: request.user._id })
                    .sort({ date: 'desc' })
                    .populate('sender')
                    .populate('receiver')
                    .populate('chats.senderName')
                    .populate('chats.receiverName')
                    .then((chat) => {
                        chat.senderRead = true;
                        chat.receiverRead = false;
                        chat.date = new Date();

                        const newChat = {
                            senderName: chat.sender._id,
                            senderRead: false,
                            receiverName: request.user._id,
                            receiverRead: true,
                            receiverMessage: request.body.chat,
                            date: new Date()
                        }

                        chat.chats.push(newChat)
                        chat.save((error, chat) => {
                            if (error) {
                                throw error;
                            }
                            if (chat) {
                                Chat.findOne({ _id: chat._id })
                                    .sort({ date: 'desc' })
                                    .populate('sender')
                                    .populate('receiver')
                                    .populate('chats.senderName')
                                    .populate('chats.receiverName')
                                    .then((chat) => {
                                        User.findById({ _id: request.user._id })
                                            .then((user) => {
                                                user.wallet = user.wallet - 1;
                                                user.save((error, user) => {
                                                    if (error) {
                                                        throw error;
                                                    }
                                                    if (user) {
                                                        response.render('chatRoom', {
                                                            title: 'Chat',
                                                            user: user,
                                                            chat: chat
                                                        })
                                                    }
                                                })
                                            })
                                    })
                            }
                        })
                    })
            }

        })
})


//requireLogin here
//handle get route
app.get('/uploadImage', (request, response) => {
    response.render('uploadImage', {
        title: 'Upload'
    })
})


//requireLogin here
app.post('/uploadAvatar', (request, response) => {
    console.log(request.user);
    console.log(request.body.upload);
    User.findById({ _id: request.user._id })
        .then((user) => {
            user.image = `https://sleepturtle-dating-app.s3.us-east-2.amazonaws.com/${request.body.upload}`;
            user.save((error) => {
                if (error) {
                    throw error;
                } else {
                    response.redirect('/profile');
                }
            })
        })
})



app.post('/uploadFile', uploadImage.any(), (request, response) => {
    const form = formidable({ multiples: true });
    form.on('file', (field, file) => {
        console.log(file);
    });
    form.on('error', (error) => {
        console.log(error);
    });
    form.on('end', () => {
        console.log('Image upload is successful');
    });
    form.parse(request);
});


//requireLogin here
app.get('/chats', (request, response) => {
    Chat.find({ receiver: request.user._id })
        .populate('sender')
        .populate('receiver')
        .populate('chats.senderName')
        .populate('chats.receiverName')
        .sort({ date: 'desc' })
        .then((received) => {
            Chat.find({ sender: request.user._id })
                .populate('sender')
                .populate('receiver')
                .populate('chats.senderName')
                .populate('chats.receiverName')
                .sort({ date: 'desc' })
                .then((sent) => {
                    response.render('chat/chats', {
                        title: 'Chat History',
                        received: received,
                        sent: sent
                    })
                })
        })
})


//charge 10 dollars
//requireLogin
app.post('/charge10dollars', (request, response) => {
    console.log(request.body);
    const amount = 1000;
    stripe.customers.create({
            email: request.body.stripeEmail,
            source: request.body.stripeToken
        })
        .then((customer) => {
            stripe.charges.create({

                amount: amount,
                description: '$10 for 20 messages',
                currency: 'usd',
                customer: customer.id,
                receipt_email: customer.email,
                shipping: {
                    address: {
                        city: "ontario",
                        country: "canada",
                        line1: "mandir gate",
                        line2: "narendrapur",
                        postal_code: "m5m1j4",
                        state: "toronto"
                    },
                    name: "Sayantan Mukherjee"
                }
            }).then((charge) => {
                User.findById({ _id: request.user._id })
                    .then((user) => {
                        user.wallet += 20;
                        user.save()
                            .then(() => {
                                response.render('success', {
                                    title: 'Success',
                                    charge: charge
                                })
                            })
                    })
            }).catch((error) => {
                console.log(error);
            })
        }).catch((error) => {
            console.log(error);
        })
})

//charge 20 dollars
//requireLogin
app.post('/charge20dollars', (request, response) => {
    console.log(request.body);
    const amount = 2000;
    stripe.customers.create({
            email: request.body.stripeEmail,
            source: request.body.stripeToken
        })
        .then((customer) => {
            stripe.charges.create({

                amount: amount,
                description: '$20 for 50 messages',
                currency: 'usd',
                customer: customer.id,
                receipt_email: customer.email,
                shipping: {
                    address: {
                        city: "ontario",
                        country: "canada",
                        line1: "mandir gate",
                        line2: "narendrapur",
                        postal_code: "m5m1j4",
                        state: "toronto"
                    },
                    name: "Sayantan Mukherjee"
                }
            }).then((charge) => {
                User.findById({ _id: request.user._id })
                    .then((user) => {
                        user.wallet += 50;
                        user.save()
                            .then(() => {
                                response.render('success', {
                                    title: 'Success',
                                    charge: charge
                                })
                            })
                    })
            }).catch((error) => {
                console.log(error);
            })
        }).catch((error) => {
            console.log(error);
        })
})

//charge 30 dollars
//requireLogin
app.post('/charge30dollars', (request, response) => {
    console.log(request.body);
    const amount = 3000;
    stripe.customers.create({
            email: request.body.stripeEmail,
            source: request.body.stripeToken
        })
        .then((customer) => {
            stripe.charges.create({

                amount: amount,
                description: '$30 for 100 messages',
                currency: 'usd',
                customer: customer.id,
                receipt_email: customer.email,
                shipping: {
                    address: {
                        city: "ontario",
                        country: "canada",
                        line1: "mandir gate",
                        line2: "narendrapur",
                        postal_code: "m5m1j4",
                        state: "toronto"
                    },
                    name: "Sayantan Mukherjee"
                }
            }).then((charge) => {
                User.findById({ _id: request.user._id })
                    .then((user) => {
                        user.wallet += 100;
                        user.save()
                            .then(() => {
                                response.render('success', {
                                    title: 'Success',
                                    charge: charge
                                })
                            })
                    })
            }).catch((error) => {
                console.log(error);
            })
        }).catch((error) => {
            console.log(error);
        })
})

//charge 40 dollars
//requireLogin
app.post('/charge40dollars', (request, response) => {
    console.log(request.body);
    const amount = 4000;
    stripe.customers.create({
            email: request.body.stripeEmail,
            source: request.body.stripeToken
        })
        .then((customer) => {
            stripe.charges.create({

                amount: amount,
                description: '$40 for 300 messages',
                currency: 'usd',
                customer: customer.id,
                receipt_email: customer.email,
                shipping: {
                    address: {
                        city: "ontario",
                        country: "canada",
                        line1: "mandir gate",
                        line2: "narendrapur",
                        postal_code: "m5m1j4",
                        state: "toronto"
                    },
                    name: "Sayantan Mukherjee"
                }
            }).then((charge) => {
                User.findById({ _id: request.user._id })
                    .then((user) => {
                        user.wallet += 300;
                        user.save()
                            .then(() => {
                                response.render('success', {
                                    title: 'Success',
                                    charge: charge
                                })
                            })
                    })
            }).catch((error) => {
                console.log(error);
            })
        }).catch((error) => {
            console.log(error);
        })
})

//delete chat
//requireLogin here
app.get('/deleteChat/:id', (request, response) => {
    Chat.deleteOne({ _id: request.params._id })
        .then(() => {
            response.redirect('/chats');
        });
});

//get route to send smile
//requireLogin here
app.get('/sendSmile/:id', (request, response) => {
    const newSmile = {
        sender: request.user._id,
        receiver: request.params.id,
        senderSent: true
    }

    new Smile(newSmile).save((error, smile) => {
        if (error) {
            throw error;
        }
        if (smile) {
            response.redirect(`/userProfile/${request.params.id}`);
        }
    })
});

//delete smile
//requireLogin here
app.get("/deleteSmile/:id", (request, response) => {
    Smile.deleteOne({ receiver: request.params.id, sender: request.user.id })
        .then(() => {
            response.redirect(`/userProfile/${request.params.id}`)
        })
})

//show smile sender
//requireLogin here
app.get('/showSmile/:id', (request, response) => {
    Smile.findOne({ _id: request.params.id })
        .populate('sender')
        .populate('receiver')
        .then((smile) => {
            smile.receiverReceived = true;

            smile.save((error, smile) => {
                if (error) {
                    throw error;
                }
                if (smile) {
                    response.render('smile/showSmile', {
                        title: 'New Smile',
                        smile: smile
                    })
                }
            })
        })
})


//get method to display post form
//requirelogin here
app.get('/displayPost', (request, response) => {
    response.render('post/displayPostForm', {
        title: 'Post'
    });
})

//create post
//requirelogin here
app.post('/createPost', (request, response) => {
    let allowComments = Boolean;
    if (request.body.allowComments) {
        allowComments = true;
    } else {
        allowComments = false;
    }
    console.log(request.body);
    const newPost = {
        title: request.body.title,
        body: request.body.body,
        status: request.body.status,
        image: `https://sleepturtle-dating-app.s3.us-east-2.amazonaws.com/${request.body.image}`,
        postUser: request.user._id,
        allowComments: allowComments,
        date: new Date()
    };

    if (request.body.status === 'public') {
        newPost.icon = 'fa fa-globe';
    } else if (request.body.status === 'private') {
        newPost.icon = 'fa fa-key';
    } else {
        newPost.icon = 'fa fa-group';
    }
    new Post(newPost).save()
        .then(() => {
            if (request.body.status === 'public') {
                response.redirect('/posts');
            } else {
                response.redirect('/profile');
            }
        })
})


//display all public posts
//requirelogin here
app.get('/posts', (request, response) => {
    Post.find({ status: 'public' })
        .populate('postUser')
        .sort({ date: 'desc' })
        .then((posts) => {
            response.render('post/posts', {
                title: 'Posts',
                posts: posts
            })
        })
})

//delete posts
//requirelogin here
app.get('/deletePost/:id', (request, response) => {
    Post.deleteOne({ _id: request.params.id })
        .then(() => {
            response.redirect('/profile');
        })

})

//edit posts
//requireLogin here
app.get('/editPost/:id', (request, response) => {
    Post.findById({ _id: request.params.id })
        .then((post) => {
            response.render('post/editPost', {
                title: 'Edit Post',
                post: post
            })
        })
})

//submit form to save update post
//requirelogin
app.post('/editPost/:id', (request, response) => {
    Post.findByIdAndUpdate({ _id: request.params.id })
        .then((post) => {
            let allowComments = Boolean;

            if (request.body.allowComments) {
                allowComments = true;
            } else {
                allowComments = false;
            }


            post.title = request.body.title;
            post.body = request.body.body;
            post.status = request.body.status;
            post.image = `https://sleepturtle-dating-app.s3.us-east-2.amazonaws.com/${request.body.image}`;
            post.date = new Date();
            post.allowComments = allowComments;

            if (request.body.status === 'public') {
                post.icon = 'fa fa-globe';
            } else if (request.body.status === 'private') {
                post.icon = 'fa fa-key';
            } else {
                post.icon = 'fa fa-group';
            }

            post.save()
                .then(() => {
                    response.redirect('/profile');
                })
        })
})

//add like for each post
//requirelogin here
app.get('/likePost/:id', (request, response) => {
    Post.findById({ _id: request.params.id })
        .then((post) => {
            const newLike = {
                likeUser: request.user._id,
                date: new Date()
            }

            post.likes.push(newLike)
            post.save((error, post) => {
                if (error) {
                    throw error;
                }
                if (post) {
                    response.redirect(`/fullPost/${post._id}`);
                }
            })
        })
})

//requirelogin here
app.get('/fullPost/:id', (request, response) => {
    Post.findById({ _id: request.params.id })
        .populate('postUser')
        .populate('likes.likeUser')
        .populate('comments.commentUser')
        .sort({ date: 'desc' })
        .then((post) => {
            response.render('post/fullpost', {
                title: 'Full Post',
                post: post
            })
        })
})

//submit form to leave comment
//requireLogin here
app.post('/leaveComment/:id', (request, response) => {
    Post.findById({ _id: request.params.id })
        .then((post) => {
            const newComment = {
                commentUser: request.user._id,
                commentBody: request.body.commentBody,
                date: new Date()
            }

            post.comments.push(newComment)
            post.save(((error, post) => {
                if (error) {
                    throw error;
                }
                if (post) {
                    response.redirect(`/fullPost/${post._id}`);
                }
            }))
        })
})

app.get('/logout', (request, response) => {
    User.findById({ _id: request.user._id }).then((user) => {
        user.online = false;
        user.save((error, user) => {
            if (error) {
                throw error;
            }
            if (user) {
                request.logout();
                response.redirect('/');
            }
        })
    })

})


app.post('/contactUs', (request, response) => {
    //console.log(request.body); //will be undefined without body parser
    const newMessage = {
        fullname: request.body.fullname,
        email: request.body.email,
        message: request.body.message,
        date: new Date()
    }

    new Message(newMessage).save((error, message) => {
        if (error) {
            throw error;
        } else {
            Message.find({}).then((messages) => {
                if (messages) {
                    response.render('newmessage', {
                        title: 'Sent',
                        messages: messages
                    });
                } else {
                    res.render('nomessage', {
                        title: 'Not Found'
                    });
                }
            });
        }
    });
});


app.listen(port, () => {
    console.log('Server is running on port ' + port);
})