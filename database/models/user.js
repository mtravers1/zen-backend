const { hashSync, compare } = require('bcrypt');
const { Schema: _Schema, Types, model } = require('mongoose');

const Schema = _Schema;

const userSchema = new Schema({
    id: {
        type: String,
        default: () => new Types.ObjectId(),
    },
    username: {
        type: String,
        required: true,
    },
    email: {
        type: String,
    },
    name: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
        set: val => hashSync(val, 10),
    },
    deleted: {
        type: Boolean,
        default: false,
    },
    tempPassword: {
        type: String,
    },
    lastUpdateDate: {
        type: Date,
    },
});

userSchema.methods.authenticate = function (password) {
    const user = this;
    return new Promise((resolve, reject) => {
        compare(password, user.password, function (err, result) {
            if (result) {
                resolve(true);
            } else {
                compare(password, user.tempPassword, function (err, result) {
                    if (result) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            }
        });
    });
};

userSchema.methods.hashPassword = function (password) {
    return hashSync(password, 10);
};

userSchema.methods.generateTempPassword = function () {
    let user = this;
    return new Promise((resolve, reject) => {
        const newTempPassword = user.generateRandomString(12);
        user.tempPassword = user.hashPassword(newTempPassword);
        user.save().then(function (user) {
            resolve({user: user, newTempPassword: newTempPassword});
        }).catch(function (error) {
            reject(error);
        });
    });
};

userSchema.methods.generateRandomString = function (stringLength) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";

    for (let i = 0; i < stringLength; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
};

const User = model('User', userSchema);

module.exports = User;