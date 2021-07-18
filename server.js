require('dotenv').config();
const express = require('express');
const Handlebars = require('handlebars');
const hbs = require('express-handlebars');
const { allowInsecurePrototypeAccess } = require('@handlebars/allow-prototype-access');
const passport = require('passport');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const session = require('express-session');


//Load models
const Message = require('./models/message');
const User = require('./models/user');

const app = express();

//use body parser middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


//configuration for authentication
app.use(cookieParser());
app.use(session({
    secret: 'mysecret',
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());


//load facebook strategy
require('./passport/facebook');

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

app.get('/', (request, response) => {
    response.render('home', {
        title: 'Home'
    });
});

app.get('/about', (request, response) => {
    response.render('about', {
        title: 'About'
    });
});

app.get('/contact', (request, response) => {
    response.render('contact', {
        title: 'Contact'
    });
});

app.get('/auth/facebook', passport.authenticate('facebook', {
    scope: ['email']
}));
app.get('/auth/facebook/callback', passport.authenticate('facebook', {
    successRedirect: '/profile',
    failureRedirect: '/'
}));

app.get('/profile', (request, response) => {
    User.findById({ _id: request.user._id }).then((user) => {

        if (user) {
            console.log(user);
            response.render('profile', {
                title: 'Profile',
                user: user
            })
        }
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