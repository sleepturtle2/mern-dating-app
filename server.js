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

//Load models
const Message = require('./models/message');
const User = require('./models/user');
const Chat = require('./models/chat');

const app = express();

//use body parser middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//load helpers
const { requireLogin, ensureGuest } = require('./helpers/auth');

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
app.engine('handlebars', hbs({ handlebars: allowInsecurePrototypeAccess(Handlebars) }));
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

app.get('/profile', requireLogin, (request, response) => {
    User.findById({ _id: request.user._id }).then((user) => {

        if (user) {
            //console.log(user);
            user.online = true;
            user.save((error, user) => {
                if (error) {
                    throw error;
                } else {
                    response.render('profile', {
                        title: 'Profile',
                        user: user
                    });
                }
            })
        }
    })
})

app.post('/updateProfile', requireLogin, (request, response) => {
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

app.get('/askToDelete', requireLogin, (request, response) => {
    response.render('askToDelete', {
        title: 'Delete'
    });
});

app.get('/deleteAccount', requireLogin, (request, response) => {
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

app.get('/userProfile/:id', (request, response) => {
    User.findById({ _id: request.params.id })
        .then((user) => {
            response.render('userProfile', {
                title: 'Profile',
                oneUser: user
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
app.get('/startChat/:id', requireLogin, (request, response) => {
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
app.get('/chat/:id', requireLogin, (request, response) => {
    Chat.findById({ _id: request.params.id })
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