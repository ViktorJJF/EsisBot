require('dotenv-safe').config();
const initMongo = require('../config/mongo');

initMongo();

const db = require('../helpers/db');
// models
const ChatbotUser = require('../models/ChatbotUsers');

(async () => {
  // create item
  let item = await db.createItem(
    {
      dni: '71203063',
      type: 'DOCENTE',
      platformId: '5f35fb31519f142148f0369a',
      first_name: 'Pablo',
      last_name: 'Mollo',
      platform: 'T',
    },
    ChatbotUser,
  );
  console.log('el item creado: ', item);
})();
