const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/user');
//const keys = require('../config/keys');


passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id, (error, user) => {
        done(error, user);
    });
});

var callbackURL;

if (process.env.NODE_ENV === 'production')
    callbackURL = 'https://mern-dating.herokuapp.com/auth/facebook/callback';
else if (process.env.NODE_ENV === 'development')
    callbackURL = 'http://localhost:3000/auth/facebook/callback';


passport.use(new FacebookStrategy({
    clientID: process.env.FacebookAppID,
    clientSecret: process.env.FacebookAppSecret,
    callbackURL: callbackURL,
    profileFields: ['email', 'name', 'displayName', 'photos']
}, (accessToken, refreshToken, profile, done) => {
    console.log(profile.photos[0].value);
    User.findOne({ facebook: profile.id }, (error, user) => {
        if (error) {
            return done(error);
        }
        if (user) {
            return done(null, user);
        } else {
            const newUser = {
                facebook: profile.id,
                fullname: profile.displayName,
                firstname: profile.name.givenName,
                lastname: profile.name.familyName,
                email: profile.emails[0].value
            }
            new User(newUser).save((error, user) => {
                if (error) {
                    return done(error);
                }
                if (user) {
                    return done(null, user);
                }
            })
        }
    });

}))