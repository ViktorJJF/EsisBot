const mongoose = require('mongoose');

const { Schema } = mongoose;

const studentsSchema = new Schema(
  {
    first_name: String,
    last_name: String,
    phone: String,
    email: String,
    studentCode: String,
    profile_pic: String,
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'Teachers',
    },
    cycle: {
      type: String,
      enum: {
        values: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'],
      },
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model('Students', studentsSchema);
