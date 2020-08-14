process.env.NTBA_FIX_319 = 1;
const TelegramBot = require('node-telegram-bot-api');
const validator = require('validator');
const uuid = require('uuid');
const _ = require('mongoose-paginate-v2');
const { param } = require('express-validator');
const { structProtoToJson } = require('../helpers/structFunctions');
const dialogflow = require('../dialogflow');
const db = require('../../helpers/db');
const ChatbotUser = require('../../models/ChatbotUsers');
const Message = require('../../models/Messages');
const Student = require('../../models/Students');
const Teacher = require('../../models/Teachers');
const Course = require('../../models/Courses');
// Algorithms
const levenshtain = require('../../algorithms/levenshtain');

// replace the value below with the Telegram token you receive from @BotFather
const token = process.env.TELEGRAMTOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {
  polling: true,
});

const sessionIds = new Map();
const attendingIds = new Map();
const documentNumbers = new Map();

(async () => {
  // await sendToDialogFlow(624818317, 'estadoDeAnimo');
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
  // await sendTextMessage(
  //   624818317,
  //   `<b>Víctor</b>, te recuerdo que este jueves 13 de agosto tienes un examen parcial de Robótica.`,
  // );
})();

async function setSessionAndUser(senderId) {
  try {
    if (!sessionIds.has(senderId)) {
      sessionIds.set(senderId, uuid.v1());
    }
  } catch (error) {
    throw error;
  }
}

bot.on('callback_query', async (action) => {
  let actionData = action.data;
  let senderId = action.from.id;
  try {
    // get option text
    let msg = '';
    let inlineOptions = action.message.reply_markup.inline_keyboard;
    for (const rowOptions of inlineOptions) {
      for (const option of rowOptions) {
        if (actionData === option.callback_data) msg = option.text;
      }
    }
    await sendTextMessage(senderId, `<b>Seleccionaste:</> ${msg}`);
    await sendToDialogFlow(senderId, actionData);
  } catch (error) {
    console.log('algo salio mal...', error);
  }
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', async (msg) => {
  const senderId = msg.from.id;
  const message = msg.text;
  const userInfo = msg.from;
  // check if user was registered
  console.log('se recibio este mensaje: ', message);
  try {
    if (!sessionIds.get(senderId)) {
      await saveUserInformation(userInfo);
    }
    // verificacion de fin de redireccionamientos
    if (message) {
      if (message.includes('FIN')) {
        return await attendStudentStop(senderId);
      }
    }
    // redireccionamiento de mensajes
    if (attendingIds.get(senderId)) {
      let attendedId = attendingIds.get(senderId);
      let attendedInfo = await getUserData(attendedId);
      return message
        ? sendTextMessage(
            attendedId,
            `<b>${attendedInfo.first_name}</b>: ${message}`,
          )
        : null;
    }
    // flujo normal con chatbot
    if (message) {
      await saveMessage(senderId, message);
      await sendToDialogFlow(senderId, message);
    } else {
      handleMessageAttachments(senderId);
    }
  } catch (error) {
    console.log(error);
  }
});

async function saveMessage(sender, message) {
  try {
    await db.createItem(
      {
        text: message,
        platform: 'T',
        platformId: sender,
      },
      Message,
    );
  } catch (error) {
    throw error;
  }
}

async function saveUserInformation(user) {
  let { id, first_name, last_name } = user;
  try {
    let response = await db.filterItems({ platformId: id }, ChatbotUser);
    if (response.payload.length === 0) {
      await db.createItem(
        {
          platformId: id,
          first_name,
          last_name,
          platform: 'T',
        },
        ChatbotUser,
      );
    }
    // set session
  } catch (error) {
    throw error;
  }
}

async function getUserData(userId) {
  let userInfo = {
    first_name: '',
    last_name: '',
    studentCode: '',
    attending: '',
    attendingPlatform: '',
    dni: '',
    type: '',
  };
  try {
    let res = await db.filterItems({ platformId: userId }, ChatbotUser);
    userInfo.first_name = res.payload[0].first_name;
    userInfo.last_name = res.payload[0].last_name;
    userInfo.studentCode = res.payload[0].studentCode;
    userInfo.attending = res.payload[0].attending;
    userInfo.attendingPlatform = res.payload[0].attendingPlatform;
    userInfo.dni = res.payload[0].dni;
    userInfo.studentCode = res.payload[0].studentCode;
    userInfo.type = res.payload[0].type;
  } catch (error) {
    throw error;
  }
  return userInfo;
}

function handleMessageAttachments(senderId) {
  // for now just reply
  sendTextMessage(senderId, 'Aún no entiendo ese tipo de mensajes');
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
  senderId,
  action,
  messages,
  contexts,
  parameters,
) {
  switch (action) {
    case 'GetStarted.estudiante.action':
      try {
        const TYPE = 'ESTUDIANTE';
        let studentCode = parameters.fields.studentCode.stringValue;
        let hasStudentCode = !validator.isEmpty(studentCode);
        if (hasStudentCode) {
          await ChatbotUser.findOneAndUpdate(
            { platformId: senderId },
            { studentCode, type: TYPE },
          );
          // update map
          documentNumbers.set(senderId, studentCode);
          await sendTextMessage(
            senderId,
            `Felicidades, te acabas de registrar como estudiante ESIS con código ${studentCode}`,
          );
          sendToDialogFlow(senderId, 'menu');
        } else {
          handleMessages(messages, senderId);
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case 'GetStarted.docente.action':
      try {
        const TYPE = 'DOCENTE';
        let dni = contexts[0].parameters.fields['dni.original'].stringValue;
        let hasDni = !validator.isEmpty(dni);
        if (hasDni) {
          if (dni.length != 8) {
            await sendTextMessage(senderId, 'El DNI debe contener 8 dígitos');
            sendToDialogFlow(senderId, 'Soy docente');
          } else {
            await ChatbotUser.findOneAndUpdate(
              { platformId: senderId },
              { dni, type: TYPE },
            );
            // update map
            documentNumbers.set(senderId, dni);
            await sendTextMessage(
              senderId,
              `Felicidades, te acabas de registrar como docente ESIS con DNI ${dni}`,
            );
            sendToDialogFlow(senderId, 'menu');
          }
        } else {
          handleMessages(messages, senderId);
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case 'GetStarted.foraneo.action':
      try {
        const TYPE = 'FORANEO';
        let dni = contexts[0].parameters.fields['dni.original'].stringValue;
        let hasDni = !validator.isEmpty(dni);
        if (hasDni) {
          if (dni.length != 8) {
            await sendTextMessage(senderId, 'El DNI debe contener 8 dígitos');
            sendToDialogFlow(senderId, 'Soy foraneo');
          } else {
            await ChatbotUser.findOneAndUpdate(
              { platformId: senderId },
              { dni, type: TYPE },
            );
            // update map
            documentNumbers.set(senderId, dni);
            await sendTextMessage(
              senderId,
              `Felicidades, te acabas de registrar como persona foránea con DNI ${dni}`,
            );
            sendToDialogFlow(senderId, 'menu');
          }
        } else {
          handleMessages(messages, senderId);
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case 'TUTOR.contactar.deseo.si.action':
      try {
        let user = await getUserData(senderId);
        let teacher = await getTeacherInfo(senderId);
        // search teacher into telegram
        let teacherTelegram = (
          await db.getOneItem({ dni: teacher.dni }, ChatbotUser)
        ).payload;
        await sendTextMessage(
          teacherTelegram.platformId,
          `Buen día profesor <b>${teacher.first_name}</b>, un tutorado desea comunicarse con usted\n` +
            `Sus datos son:\n` +
            `<b>Código: </b>${user.studentCode}\n` +
            `<b>Nombres: </b>${user.first_name}\n` +
            `<b>Apellidos: </b>${user.last_name}`,
        );
        // send options
        await sendQuickReply(
          teacherTelegram.platformId,
          '¿Desea aceptar su solicitud?',
          [
            {
              text: 'Sí',
              callback_data: `yes_attend_student ${senderId}`,
            },
            {
              text: 'No',
              callback_data: `no_attend_student ${senderId}`,
            },
          ],
        );
        handleMessages(messages, senderId);
      } catch (error) {
        console.log(error);
      }
      break;
    case 'TUTOR.contactar.tutor.si.action':
      try {
        let studentTelegramId = parameters.fields.studentTelegramId.stringValue;
        await attendStudent(senderId, studentTelegramId);
        let teacherTelegramInfo = await getUserData(senderId);
        let studentTelegramInfo = await getUserData(studentTelegramId);
        // informar al docente que está conectado con tutorado
        await sendTextMessage(
          senderId,
          `✅Profesor <b>{first_name}</b>, ahora estás conectado con tu tutorado <b>${studentTelegramInfo.first_name} ${studentTelegramInfo.last_name}</b>`,
        );
        await sendTextMessage(
          senderId,
          'Se redireccionarán los mensajes que escribas. Para finalizar, escribe FIN 👍',
        );
        // informar al estudiante que el tutor acepto la solicitud de contacto
        await sendTextMessage(
          studentTelegramId,
          `Alumno <b>${studentTelegramInfo.first_name}</b>, tu tutor <b>${teacherTelegramInfo.first_name} ${teacherTelegramInfo.last_name}</b> aceptó tu solicitud de contacto`,
        );
        await sendTextMessage(
          studentTelegramId,
          'Se redireccionarán los mensajes que escribas. Para finalizar, escribe FIN 👍',
        );
      } catch (error) {
        sendTextMessage(
          senderId,
          'Algo salió mal... probablemente no lo tengo a usted registado como docente',
        );
        console.log(error);
      }
      break;
    case 'TUTOR.contactar.tutor.no.action':
      try {
        let studentTelegramId = parameters.fields.studentTelegramId.stringValue;
        sendTextMessage(
          studentTelegramId,
          '❗ {first_name}, tu tutor me acaba de indicar que en estos momentos no está disponible para atenderlo. Mil disculpas. ',
        );
        handleMessages(messages, senderId);
      } catch (error) {
        console.log(error);
      }

      break;
    case 'COVID.sientoSintomas.action':
      // mostrar sintomas
      await handleMessages(messages, senderId);
      // dar opcion de comunicar al tutor
      sendToDialogFlow(senderId, 'quiero comunicarme con mi tutor');
      break;
    case 'Cursos.bibliografia.action':
      try {
        let courseName = parameters.fields.courseName.stringValue;
        let courses = (await db.filterItems({}, Course)).payload;
        // generating dictionary
        let coursesDictionary = [];
        courses.forEach((course) => {
          coursesDictionary.push({
            value: course.name,
            synonym: [course.name],
          });
        });
        let wordMatch = levenshtain.compareStrings(
          courseName,
          coursesDictionary,
        );
        console.log('la palabrita: ', wordMatch);
        if (wordMatch[0] > 0.5) {
          let selectedCourse = courses.find(
            (course) => course.name === wordMatch[1],
          );
          await sendTextMessage(
            senderId,
            `Muy bien {first_name}, deseas material de estudio del curso ${selectedCourse.name}`,
          );
          // si no cuenta con material bibliografico
          if (selectedCourse.material.length > 0) {
            let msg = '';
            selectedCourse.material.forEach((material) => {
              msg += `☑ ${material.name} ➡ ${material.url}\n`;
            });
            await sendTextMessage(senderId, msg);
          } else {
            await sendTextMessage(
              senderId,
              'Lamentablemente aún no me entregaron material bibligráfico respecto a ese curso 😔',
            );
          }
        } else {
          sendQuickReply(
            senderId,
            `No estoy seguro del nombre del curso que indicaste...\n ¿Quizás quisiste decir ${wordMatch[1]}?`,
            [
              { text: 'Sí', callback_data: `yes_match_course ${wordMatch[1]}` },
              { text: 'No', callback_data: `no_match_course` },
            ],
          );
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case 'Cursos.silabos.action':
      try {
        let courseName = parameters.fields.courseName.stringValue;
        let courses = (await db.filterItems({}, Course)).payload;
        // generating dictionary
        let coursesDictionary = [];
        courses.forEach((course) => {
          coursesDictionary.push({
            value: course.name,
            synonym: [course.name],
          });
        });
        let wordMatch = levenshtain.compareStrings(
          courseName,
          coursesDictionary,
        );
        console.log('la palabra: ', wordMatch);
        if (wordMatch[0] > 0.5) {
          let selectedCourse = courses.find(
            (course) => course.name === wordMatch[1],
          );
          await sendTextMessage(
            senderId,
            `Muy bien {first_name}, deseas el sílabo del curso ${selectedCourse.name}`,
          );
          // si no cuenta con sílabo
          if (!validator.isEmpty(selectedCourse.syllabus)) {
            let msg = `Puedes encontrarlo aquí ⬇\n${selectedCourse.syllabus}`;
            await sendTextMessage(senderId, msg);
          } else {
            await sendTextMessage(
              senderId,
              'Lamentablemente aún no me entregaron el sílabo de ese curso 😔',
            );
          }
        } else {
          sendQuickReply(
            senderId,
            `No estoy seguro del nombre del curso que indicaste...\n ¿Quizás quisiste decir ${wordMatch[1]}?`,
            [
              {
                text: 'Sí',
                callback_data: `yes_match_syllabus_course ${wordMatch[1]}`,
              },
              { text: 'No', callback_data: `no_match_syllabus_course` },
            ],
          );
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case 'Cursos.bibliografia.match.si.action':
      try {
        let courseName = parameters.fields.courseName.stringValue;
        let selectedCourse = (await db.getOneItem({ name: courseName }, Course))
          .payload;
        let msg = '';
        await sendTextMessage(
          senderId,
          `Material de estudio del curso ${courseName}:`,
        );
        // si no cuenta con material bibliografico
        if (selectedCourse.material.length > 0) {
          selectedCourse.material.forEach((material) => {
            msg += `☑ ${material.name} ➡ ${material.url}\n`;
          });
          await sendTextMessage(senderId, msg);
        } else {
          await sendTextMessage(
            senderId,
            'Lamentablemente aún no me entregaron material bibligráfico respecto a ese curso😔',
          );
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case 'Cursos.silabos.match.si.action':
      try {
        console.log('se entro al action silabo si');
        let courseName = parameters.fields.courseName.stringValue;
        let selectedCourse = (await db.getOneItem({ name: courseName }, Course))
          .payload;
        await sendTextMessage(senderId, `Sílabo del curso ${courseName}:`);
        // si no cuenta con sílabo
        if (!validator.isEmpty(selectedCourse.syllabus)) {
          let msg = `Puedes encontrarlo aquí ⬇\n${selectedCourse.syllabus}`;
          await sendTextMessage(senderId, msg);
        } else {
          await sendTextMessage(
            senderId,
            'Lamentablemente aún no me entregaron el sílabo de ese curso 😔',
          );
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case 'ESIS.docentes.listado.action':
      try {
        let teachers = (await db.filterItems({}, Teacher)).payload;
        let msg = 'En ESIS contamos con los siguientes docentes:\n';
        teachers.forEach((teacher) => {
          msg += `☑ ${teacher.first_name} ${teacher.last_name}\n`;
        });
        msg +=
          '❗ Si deseas obtener el contacto de algún docente en específico, escribe -> contactos + nombre del docente';
        sendTextMessage(senderId, msg);
      } catch (error) {
        console.log(error);
      }
      break;
    default:
      console.log('nombre del action: ', action);
      console.log(
        'se mandara el mensaje por defecto de handleDialogFlowAction',
      );
      handleMessages(messages, senderId);
      break;
  }
}

async function attendStudent(teacherTelegramId, studentTelegramId) {
  try {
    // update teacher

    await Promise.all([
      ChatbotUser.findOneAndUpdate(
        { platformId: teacherTelegramId, type: 'DOCENTE' },
        { attending: studentTelegramId, attendingPlatform: 'T' },
      ),
      ChatbotUser.findOneAndUpdate(
        { platformId: studentTelegramId, type: 'ESTUDIANTE' },
        { attending: teacherTelegramId, attendingPlatform: 'T' },
      ),
    ]);
    // update student
    attendingIds.set(teacherTelegramId, studentTelegramId);
    attendingIds.set(studentTelegramId, teacherTelegramId);
  } catch (error) {
    throw error;
  }
}

async function attendStudentStop(telegramId) {
  try {
    let userCurrentInfo = await getUserData(telegramId);
    let userAttendedInfo = await getUserData(userCurrentInfo.attending);
    await Promise.all([
      ChatbotUser.findOneAndUpdate(
        { platformId: telegramId },
        { attending: null },
      ),
      ChatbotUser.findOneAndUpdate(
        { platformId: userCurrentInfo.attending },
        { attending: null },
      ),
    ]);
    // delete from map
    attendingIds.delete(telegramId);
    attendingIds.delete(userAttendedInfo.platformId);
    // notify users
    sendTextMessage(telegramId, 'La conversación terminó 👍');
    sendTextMessage(userAttendedInfo.platformId, 'La conversación terminó 👍');
  } catch (error) {
    throw error;
  }
}

async function getTeacherInfo(senderId) {
  try {
    let chatbotUser = (
      await db.getOneItem({ platformId: senderId }, ChatbotUser)
    ).payload;
    let { studentCode } = chatbotUser;
    let student = (await db.getOneItem({ studentCode }, Student)).payload;
    console.log('el estudiante: ', student);
    let teacher = (await db.getOneItem({ _id: student.teacherId }, Teacher))
      .payload;
    return teacher;
  } catch (err) {
    sendTextMessage(
      senderId,
      '{first_name}, algo salió mal... probablemente tu código de estudiante registrado es erróneo o no cuentas con un tutor asignado...',
    );
    throw err;
  }
}

async function verifyDocumentNum(senderId) {
  let documentNumber;
  if (!documentNumbers.has(senderId)) {
    // se verifica el dni en db
    let userData = await getUserData(senderId);
    if (userData.type === 'ESTUDIANTE') documentNumber = userData.studentCode;
    else documentNumber = userData.dni;
    documentNumbers.set(senderId, documentNumber);
  }
  return documentNumbers.get(senderId);
}

async function sendToDialogFlow(senderId, messageText) {
  sendTypingOn(senderId);
  try {
    let result;
    setSessionAndUser(senderId);
    let session = sessionIds.get(senderId);
    // check DNI or CODE Student middleware
    // let documentNum = await verifyDocumentNum(senderId);
    // console.log('este es el dni: ', documentNum);
    // if (!isDefined(documentNum)) {
    // console.log('se mandara esto: ');
    // result = await dialogflow.sendToDialogFlow(
    // 'GetStarted',
    // session,
    // 'TELEGRAM',
    // );
    // } else {
    // end
    // send to dialogflow
    result = await dialogflow.sendToDialogFlow(
      messageText,
      session,
      'TELEGRAM',
    );
    // }

    handleDialogFlowResponse(senderId, result);
  } catch (error) {
    console.log('salio mal en sendToDialogflow...', error);
  }
}

function sendTypingOn(senderId) {
  bot.sendChatAction(senderId, 'typing');
}

async function handleMessage(message, sender) {
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
    message = message
      .replace('{first_name}', userData.first_name)
      .replace('{last_name}', userData.last_name);
  }
  if (message.includes('{tutor_fullname}')) {
    let teacher = await getTeacherInfo(senderId);
    message = message.replace(
      '{tutor_fullname}',
      `${teacher.first_name} ${teacher.last_name}`,
    );
  }
  // send message
  await bot.sendMessage(senderId, message, {
    parse_mode: 'HTML',
  });
}

function isDefined(obj) {
  if (typeof obj === 'undefined') {
    return false;
  }

  if (!obj) {
    return false;
  }
  if (obj === '') {
    return false;
  }
  return obj != null;
}
