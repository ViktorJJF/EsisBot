const mongoose = require('mongoose');

const { Schema } = mongoose;

const chatbotUsersSchema = new Schema(
  {
    first_name: String,
    last_name: String,
    platformId: String,
    profile_pic: String,
    studentCod: { type: String, default: null },
    platform: String,
    type: {
      type: String,
      default: 'FORANEO',
      enum: { values: ['ESTUDIANTE', 'DOCENTE', 'FORANEO'] },
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model('ChatbotUsers', chatbotUsersSchema);
