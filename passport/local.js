const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const User = require('../models/user');
const bcrypt = require('bcryptjs');


passport.serializeUser((suser, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id, (error, user) => {
        done(error, user);
    });
});

passport.use(new localStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, (email, password, done) => {
    User.findOne({ email: email })
        .then((user) => {
            if (!user) {
                return done(null, false);
            }
            bcrypt.compare(password, user.password, (error, isMatch) => {
                if (error) {
                    return done(error);
                }
                if (isMatch) {
                    return done(null, user);
                } else {
                    return done(null, false);
                }
            })
        }).catch((error) => {
            console.log(error);
        });
}));