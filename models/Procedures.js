const mongoose = require('mongoose');

const { Schema } = mongoose;

const proceduresSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    requirements: { type: String },
    attendant: String,
    synonyms: [String],
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model('Procedures', proceduresSchema);
