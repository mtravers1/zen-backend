import { Schema, Types, model } from 'mongoose';

const roleSchema = new Schema({
    id: {
        type: String,
        default: () => new Types.ObjectId().toString(),
        immutable: true,
    },
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    deleted: {
        type: Boolean,
        default: false,
    },
    createdById: {
        type: String,
    },
    updatedById: {
        type: String,
    },
    lastUpdateDate: {
        type: Date,
    }
}, { timestamps: true });

const Role = model('Role', roleSchema);

module.exports = Role;