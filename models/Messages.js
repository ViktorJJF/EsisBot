const mongoose = require('mongoose');

const { Schema } = mongoose;

const messagesSchema = new Schema(
  {
    text: { type: String, required: true },
    platform: {
      type: String,
      required: true,
      enum: { values: ['T', 'F', 'TI'] },
    },
    platformId: { type: String, required: true },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model('Messages', messagesSchema);
