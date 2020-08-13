const mongoose = require('mongoose');

const { Schema } = mongoose;

const teacherSchema = new Schema(
  {
    first_name: String,
    last_name: String,
    phone: String,
    platformId: String,
    profile_pic: String,
    email: String,
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model('Teachers', teacherSchema);
