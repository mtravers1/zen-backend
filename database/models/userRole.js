const { Schema: _Schema, Types, model } = require('mongoose');

const Schema = _Schema;

const userRoleSchema = new Schema({
    id: {
        type: String,
        default: () => new Types.ObjectId().toString(),
    },
    userId: {
        type: String,
        required: true,
    },
    roleId: {
        type: String,
        required: true,
    },
    deleted: {
        type: Boolean,
        default: false,
    },
    lastUpdateDate: {
        type: Date,
        default: Date.now,
    }
});

const UserRole = model('UserRole', userRoleSchema);

module.exports = UserRole;