const mongoose = require('mongoose');

const { Schema } = mongoose;

const coursesSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    cycle: {
      type: String,
      enum: {
        values: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'],
      },
    },
    credit: Number,
    material: [{ name: String, url: String }],
    syllabus: String,
    synonyms: [String],
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model('Courses', coursesSchema);
