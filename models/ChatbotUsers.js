const mongoose = require('mongoose');

const { Schema } = mongoose;

const chatbotUsersSchema = new Schema(
  {
    first_name: String,
    last_name: String,
    platformId: { type: String, required: true },
    profile_pic: String,
    studentCode: { type: String, default: null },
    dni: { type: String, default: null },
    platform: {
      type: String,
      required: true,
      enum: { values: ['F', 'T', 'TI'] },
    },
    type: {
      type: String,
      default: 'FORANEO',
      enum: { values: ['ESTUDIANTE', 'DOCENTE', 'FORANEO'] },
    },
    attending: {
      type: String,
      default: null,
    },
    attendingPlatform: {
      type: String,
      enum: { values: ['F', 'T', 'TI'] },
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model('ChatbotUsers', chatbotUsersSchema);
