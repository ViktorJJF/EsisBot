process.env.NTBA_FIX_319 = 1;
const TelegramBot = require('node-telegram-bot-api');
const validator = require('validator');
const uuid = require('uuid');
const { structProtoToJson } = require('../helpers/structFunctions');
const dialogflow = require('../dialogflow');
const db = require('../../helpers/db');
const ChatbotUser = require('../../models/ChatbotUsers');

// replace the value below with the Telegram token you receive from @BotFather
const token = process.env.TELEGRAMTOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {
  polling: true,
});

const sessionIds = new Map();

(async () => {
  await sendToDialogFlow(624818317, 'estadoDeAnimo');
  // mensaje para tutor
  // await sendTextMessage(
  //   624818317,
  //   `Buen día profesor <b>Edgar Taya</b>, un estudiante desea comunicarse con usted.
  //   Sus datos son:
  // <b>Nombres: </b>Víctor Juan Jimenez Flores
  // <b>Asunto: </b>Estoy presentando síntomas`,
  // );
  // mensaje anonimo
  // await sendTextMessage(
  //   624818317,
  //   `<b>Un estudiante pregunta lo siguiente:</b>
  // ✅ ¿Qué beneficios me aportan las bases de datos relacionales sobre las no relacionales?`,
  // );
  // mensaje no anonimo
  // await sendTextMessage(
  //   624818317,
  //   `El estudiante <b>Víctor Juan Jimenez Flores</b> pregunta lo siguiente:
  //   ✅ ¿Qué beneficios me aportan las bases de datos relacionales sobre las no relacionales?`,
  // );
  // comunicado
  // await sendTextMessage(
  //   624818317,
  //   `<b>Comunicado</b>
  // Se comunica a todos los estudiantes que pueden asistir a un webinar sobre <b>ESTADÍSTICA</b>
  // <b>Inicio:</b> 5 de septiembre de 2020
  // <b>Horarios:</b> Sábados y domingos de 4:30 a 7:00pm
  // <b>Transmisión:</b> Google Meet
  // <b>Informes:</b> Dr. Luis López Puycan - 964888736`,
  // );
  // recordatorio
  await sendTextMessage(
    624818317,
    `<b>Víctor</b>, te recuerdo que este jueves 13 de agosto tienes un examen parcial de Robótica.`,
  );
})();

function setSessionAndUser(senderId) {
  try {
    if (!sessionIds.has(senderId)) {
      console.log('no habia sesion de usuario y se creara:', senderId);
      sessionIds.set(senderId, uuid.v1());
    }
  } catch (error) {
    throw error;
  }
}

bot.on('callback_query', async (action) => {
  let msg = action.data;
  let senderId = action.from.id;
  await sendTextMessage(senderId, `<b>Seleccionaste:</> ${msg}`);
  await sendToDialogFlow(senderId, msg);
  // bot.answerCallbackQuery({
  //     callback_query_id: action.id,
  //     text: "El texto alerta",
  //     show_alert: false
  // })
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', async (msg) => {
  const sender = msg.from.id;
  const message = msg.text;
  const userInfo = msg.from;
  // check if user was registered
  console.log('Usuario Id: ', msg.from);
  console.log('mensaje recibido: ', msg);
  await saveUserInformation(userInfo);
  await sendToDialogFlow(sender, message);
  // send a message to the chat acknowledging receipt of their message
});

async function saveUserInformation(user) {
  let { id, first_name, last_name } = user;
  let response = await db.filterItems({ platformId: id }, ChatbotUser);
  try {
    if (response.payload.length === 0) {
      await db.createItem(
        { platformId: id, first_name, last_name },
        ChatbotUser,
      );
    }
    // set session
    setSessionAndUser(id);
  } catch (error) {
    throw error;
  }
}

async function getUserData(userId) {
  let userInfo = { first_name: '', last_name: '', studentCod: '' };
  try {
    let res = await db.filterItems({ platformId: userId }, ChatbotUser);
    userInfo.first_name = res.payload[0].first_name;
    userInfo.last_name = res.payload[0].last_name;
    userInfo.studentCod = res.payload[0].studentCod;
  } catch (error) {
    throw error;
  }
  return userInfo;
}

async function handleDialogFlowResponse(sender, response) {
  let responseText = response.fulfillmentMessages.fulfillmentText;
  let messages = response.fulfillmentMessages;
  let { action } = response;
  let contexts = response.outputContexts;
  let { parameters } = response;
  if (isDefined(action)) {
    handleDialogFlowAction(sender, action, messages, contexts, parameters);
  } else if (isDefined(messages)) {
    handleMessages(messages, sender);
  } else if (responseText === '' && !isDefined(action)) {
    // dialogflow could not evaluate input.
    sendTextMessage(sender, 'No estoy seguro de lo que deseas...');
  } else if (isDefined(responseText)) {
    sendTextMessage(sender, responseText);
  }
}

async function handleDialogFlowAction(
  sender,
  action,
  messages,
  contexts,
  parameters,
) {
  switch (action) {
    case 'ActionQueja.action':
      handleMessages(messages, sender);
      break;
    default:
      console.log(
        'se mandara el mensaje por defecto de handleDialogFlowAction',
      );
      handleMessages(messages, sender);
      break;
  }
}

async function sendToDialogFlow(senderId, messageText) {
  sendTypingOn(senderId);
  let session = sessionIds.get(senderId) || '12314-251251';
  let result = await dialogflow.sendToDialogFlow(
    messageText,
    session,
    'TELEGRAM',
  );
  handleDialogFlowResponse(senderId, result);
}

function sendTypingOn(senderId) {
  bot.sendChatAction(senderId, 'typing');
}

async function handleMessage(message, sender) {
  console.log('se entro a handleMessage');
  console.log('mensaje: ', message);
  console.log('switch: ', message.message);
  console.log('texto: ', message.text);
  switch (message.message) {
    case 'text': // text
      for (const text of message.text.text) {
        if (text !== '') {
          await sendTextMessage(sender, text);
        }
      }
      break;
    case 'quickReplies': // quick replies
      let { title } = message.quickReplies;
      console.log('el titulo es:', title);
      let replies = [];
      message.quickReplies.quickReplies.forEach((text) => {
        replies.push({
          text,
          callback_data: text,
        });
      });
      await sendQuickReply(sender, title, replies);
      break;
    case 'image': // image
      await sendImageMessage(sender, message.image.imageUri);
      break;
    case 'payload':
      await handleDialogflowPayload(sender, message.payload);
      break;
    default:
      break;
  }
}

function handleDialogflowPayload(senderId, payload) {
  let desestructPayload = structProtoToJson(payload);
  let type = desestructPayload.telegram.attachment.payload.template_type;
  console.log('el mensaje desestructurado: ', desestructPayload);
  switch (type) {
    case 'button':
      let { text } = desestructPayload.telegram.attachment.payload;
      let { buttons } = desestructPayload.telegram.attachment.payload;
      let formattedButtons = [];
      buttons.forEach((button) => {
        formattedButtons.push({
          text: button.title,
          url: button.url,
        });
      });
      sendButtons(senderId, text, formattedButtons);
      break;

    default:
      console.log('el tipo de payload no se reconoce...');
      break;
  }
}

async function sendButtons(senderId, title, buttons) {
  console.log('se enviara este boton: ', title, buttons);
  buttons = buttons.map((button) => {
    if (validator.isEmpty(button.callback_data)) {
      button.callback_data = button.text;
    }
    return button;
  });
  await bot.sendMessage(senderId, title, {
    reply_markup: {
      inline_keyboard: [buttons],
      resize_keyboard: true,
    },
    parse_mode: 'HTML',
  });
}

async function sendQuickReply(senderId, title, replies) {
  await bot.sendMessage(senderId, title, {
    parse_mode: 'html',
    reply_markup: {
      inline_keyboard: [replies],
      resize_keyboard: true,
    },
  });
}

async function sendImageMessage(senderId, url) {
  if (validator.isURL(url)) {
    await bot.sendChatAction(senderId, 'upload_photo');
    await bot.sendPhoto(senderId, url);
  }
}

async function handleMessages(messages, sender) {
  for (let i = 0; i < messages.length; i++) {
    switch (messages[i].message) {
      case 'card':
        await handleCardMessages([messages[i]], sender);
        break;
      case 'text':
        await handleMessage(messages[i], sender);
        break;
      case 'image':
        await handleMessage(messages[i], sender);
        break;
      case 'quickReplies':
        await handleMessage(messages[i], sender);
        break;
      default:
        break;
    }
    await timeout(500);
  }
}

async function timeout(millis) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, millis);
  });
}

async function handleCardMessages(messages, senderId) {
  for (let m = 0; m < messages.length; m++) {
    let message = messages[m];
    let buttons = [];
    for (let b = 0; b < message.card.buttons.length; b++) {
      let isLink = message.card.buttons[b].postback.substring(0, 4) === 'http';
      let button;
      if (isLink) {
        button = {
          text: message.card.buttons[b].text,
          url: message.card.buttons[b].postback,
        };
      } else {
        button = {
          text: message.card.buttons[b].text,
          callback_data: message.card.buttons[b].postback,
        };
      }
      buttons.push(button);
    }

    let element = {
      title: message.card.title,
      image_url: message.card.imageUri,
      subtitle: message.card.subtitle || ' ',
      buttons,
    };
    await sendGenericMessage(senderId, element);
  }
}

async function sendGenericMessage(senderId, element) {
  await sendImageMessage(senderId, element.image_url);
  // await sendTextMessage(senderId, `<b>${element.title}</b>`);
  await sendButtons(
    senderId,
    `<b>${element.title}</b>` + `\n${element.subtitle}`,
    element.buttons,
  );
}

async function sendTextMessage(senderId, message) {
  if (message.includes('{first_name}') || message.includes('{last_name}')) {
    let userData = await getUserData(senderId);
    console.log('los datos de usuario: ', userData);
    message = message
      .replace('{first_name}', userData.first_name)
      .replace('{{last_name}}', userData.last_name);
  }
  bot.sendMessage(senderId, message, {
    parse_mode: 'HTML',
  });
}

function isDefined(obj) {
  if (obj === undefined) {
    return false;
  }

  if (obj === null) {
    return false;
  }
  return true;
}
