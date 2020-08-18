const express = require('express');
const validator = require('validator');

const router = express.Router();
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const uuid = require('uuid');

const app = express();
const axios = require('axios');
const dialogflow = require('../dialogflow');
const { structProtoToJson } = require('../helpers/structFunctions');

const db = require('../../helpers/db');
const ChatbotUser = require('../../models/ChatbotUsers');
const Message = require('../../models/Messages');
const Student = require('../../models/Students');
const Teacher = require('../../models/Teachers');
const Course = require('../../models/Courses');
const Procedure = require('../../models/Procedures');
// Algorithms
const levenshtain = require('../../algorithms/levenshtain');

// Messenger API parameters
if (!process.env.FB_PAGE_TOKEN) {
  throw new Error('missing FB_PAGE_TOKEN');
}
if (!process.env.FB_VERIFY_TOKEN) {
  throw new Error('missing FB_VERIFY_TOKEN');
}
if (!process.env.GOOGLE_PROJECT_ID) {
  throw new Error('missing GOOGLE_PROJECT_ID');
}
if (!process.env.DF_LANGUAGE_CODE) {
  throw new Error('missing DF_LANGUAGE_CODE');
}
if (!process.env.GOOGLE_CLIENT_EMAIL) {
  throw new Error('missing GOOGLE_CLIENT_EMAIL');
}
if (!process.env.GOOGLE_PRIVATE_KEY) {
  throw new Error('missing GOOGLE_PRIVATE_KEY');
}
if (!process.env.FB_APP_SECRET) {
  throw new Error('missing FB_APP_SECRET');
}
// if (!process.env.SERVER_URL) {
//   //used for ink to static files
//   throw new Error("missing SERVER_URL");
// }

// verify request came from facebook
// app.use(
//   bodyParser.json({
//     verify: verifyRequestSignature,
//   })
// );

const sessionIds = new Map();
const attendingIds = new Map();
const documentNumbers = new Map();

// serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(
  bodyParser.urlencoded({
    extended: false,
  }),
);

// Process application/json
app.use(bodyParser.json());

// for Facebook verification
router.get('/webhook/', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === process.env.FB_VERIFY_TOKEN
  ) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error('Failed validation. Make sure the validation tokens match.');
    res.sendStatus(403);
  }
});

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
router.post('/webhook/', (req, res) => {
  let data = req.body;
  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach((pageEntry) => {
      let pageID = pageEntry.id;
      let timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach((messagingEvent) => {
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else if (messagingEvent.read) {
          receivedMessageRead(messagingEvent);
        } else if (messagingEvent.account_linking) {
          receivedAccountLink(messagingEvent);
        } else {
          console.log(
            'Webhook received unknown messagingEvent: ',
            messagingEvent,
          );
        }
      });
    });

    // Assume all went well.
    // You must send back a 200, within 20 seconds
    res.sendStatus(200);
  }
});

async function receivedMessage(event) {
  let senderId = event.sender.id;
  let recipientID = event.recipient.id;
  let timeOfMessage = event.timestamp;
  let { message } = event;
  // console.log("Received message for user %d and page %d at %d with message:", senderId, recipientID, timeOfMessage);
  // console.log(JSON.stringify(message));

  let isEcho = message.is_echo;
  let messageId = message.mid;
  let appId = message.app_id;
  let { metadata } = message;

  // You may get a text or attachment but not both
  let messageText = message.text;
  let messageAttachments = message.attachments;
  let quickReply = message.quick_reply;

  if (isEcho) {
    handleEcho(messageId, appId, metadata);
    return;
  }
  if (quickReply) {
    handleQuickReply(senderId, quickReply, messageId);
    return;
  }

  if (messageText) {
    // send message to api.ai
    console.log('se recibio este mensaje: ', messageText);
    try {
      if (!sessionIds.get(senderId)) {
        let userInfo = await getUserDataFacebook(senderId);
        await saveUserInformation(userInfo);
      }
      if (messageText.includes('FIN')) {
        console.log('enviare este senderId: ', senderId);
        return await attendStudentStop(senderId);
      }
      // redireccionamiento de mensajes
      if (attendingIds.get(senderId)) {
        let attendedId = attendingIds.get(senderId);
        let attendedInfo = await getUserData(senderId);
        return messageText
          ? sendTextMessage(
              attendedId,
              `${attendedInfo.first_name}: ${messageText}`,
            )
          : null;
      }
      // flujo normal
      await saveMessage(senderId, messageText);
      await sendToDialogFlow(senderId, messageText);
    } catch (error) {
      console.log(error);
    }
  } else if (messageAttachments) {
    handleMessageAttachments(messageAttachments, senderId);
  }
}

function handleMessageAttachments(messageAttachments, senderID) {
  // for now just reply
  sendTextMessage(senderID, 'Attachment received. Thank you.');
}

async function attendStudent(teacherTelegramId, studentTelegramId) {
  try {
    // update teacher

    await Promise.all([
      ChatbotUser.findOneAndUpdate(
        { platformId: teacherTelegramId, type: 'DOCENTE' },
        { attending: studentTelegramId, attendingPlatform: 'F' },
      ),
      ChatbotUser.findOneAndUpdate(
        { platformId: studentTelegramId, type: 'ESTUDIANTE' },
        { attending: teacherTelegramId, attendingPlatform: 'F' },
      ),
    ]);
    // update student
    attendingIds.set(teacherTelegramId, studentTelegramId);
    attendingIds.set(studentTelegramId, teacherTelegramId);
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

async function attendStudentStop(senderId) {
  try {
    console.log('llego este sender: ', senderId);
    let userCurrentInfo = await getUserData(senderId);
    console.log('el currentInfo: ', userCurrentInfo);
    let userAttendedInfo = await getUserData(userCurrentInfo.attending);
    console.log('el attended: ', userAttendedInfo);
    await Promise.all([
      ChatbotUser.findOneAndUpdate(
        { platformId: senderId },
        { attending: null },
      ),
      ChatbotUser.findOneAndUpdate(
        { platformId: userCurrentInfo.attending },
        { attending: null },
      ),
    ]);
    // delete from map
    attendingIds.delete(senderId);
    attendingIds.delete(userAttendedInfo.platformId);
    // notify users
    console.log('el senderId: ', senderId);
    console.log('el senderId: ', userAttendedInfo.platformId);
    sendTextMessage(senderId, 'La conversación terminó 👍');
    sendTextMessage(userCurrentInfo.attending, 'La conversación terminó 👍');
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
          platform: 'F',
        },
        ChatbotUser,
      );
    }
    // set session
  } catch (error) {
    throw error;
  }
}

async function verifyDocumentNum(senderId) {
  if (!documentNumbers.has(senderId)) {
    try {
      let user = (
        await db.getOneItem(
          { platformId: senderId, platform: 'F' },
          ChatbotUser,
        )
      ).payload;
      if (user.dni) {
        documentNumbers.set(senderId, user.dni);
      }
      if (user.studentCode) {
        documentNumbers.set(senderId, user.studentCode);
      }
    } catch (error) {
      throw error;
    }
  }
  return documentNumbers.get(senderId);
}

async function saveMessage(sender, message) {
  try {
    await db.createItem(
      {
        text: message,
        platform: 'F',
        platformId: sender,
      },
      Message,
    );
  } catch (error) {
    throw error;
  }
}

async function setSessionAndUser(senderId) {
  try {
    if (!sessionIds.has(senderId)) {
      sessionIds.set(senderId, uuid.v1());
    }
  } catch (error) {
    throw error;
  }
}

async function handleQuickReply(senderID, quickReply, messageId) {
  let quickReplyPayload = quickReply.payload;
  console.log(
    'Quick reply for message %s with payload %s',
    messageId,
    quickReplyPayload,
  );
  // send payload to api.ai
  sendToDialogFlow(senderID, quickReplyPayload);
}

// https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
  // Just logging message echoes to console
  console.log(
    'Received echo for message %s and app %d with metadata %s',
    messageId,
    appId,
    metadata,
  );
}

async function handleDialogFlowAction(
  senderId,
  action,
  messages,
  contexts,
  parameters,
) {
  switch (action) {
    case 'ESIS.tramites.action':
      try {
        let procedureName = parameters.fields.procedureName.stringValue;
        // if no procedure name
        if (validator.isEmpty(procedureName)) {
          return sendTextMessage(
            senderId,
            'Intenta preguntarme de la siguiente forma: ☑ requisitos de la constancia de estudios',
          );
        }
        // continue
        let procedures = (await db.filterItems({}, Procedure)).payload;
        // generating dictionary
        let proceduresDictionary = [];
        procedures.forEach((procedure) => {
          proceduresDictionary.push({
            value: procedure.name,
            synonym: procedure.synonyms,
          });
        });
        let wordMatch = levenshtain.compareStrings(
          procedureName,
          proceduresDictionary,
        );
        console.log('la palabra: ', wordMatch);
        if (wordMatch[0] > 0.5) {
          let selectedProcedure = procedures.find(
            (procedure) => procedure.name === wordMatch[1],
          );
          await sendTextMessage(
            senderId,
            `Los requisitos de ${selectedProcedure.name} son: `,
          );
          await sendTextMessage(senderId, selectedProcedure.requirements);
        } else {
          await sendTextMessage(
            senderId,
            'No encontré el trámite al que haces referencia, intenta preguntarme de la siguiente forma: ☑ requisitos de la constancia de estudios',
          );
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case 'ESIS.docentes.listado.especifico.action':
      try {
        let teacherName = parameters.fields.teacherName.stringValue;
        console.log('el nombre del teacher: ', teacherName);
        // if no procedure name
        if (validator.isEmpty(teacherName)) {
          return sendTextMessage(
            senderId,
            'Intenta preguntarme de la siguiente forma: ☑ contactos del docente + nombres docente',
          );
        }
        // continue
        let teachers = (await db.filterItems({}, Teacher)).payload;
        // generating dictionary
        let teachersDictionary = [];
        teachers.forEach((teacher) => {
          teachersDictionary.push({
            value: teacher.first_name,
            synonym: [
              `${teacher.first_name} ${teacher.last_name}`,
              teacher.first_name,
              teacher.last_name,
              ...teacher.first_name.split(' '),
              ...teacher.last_name.split(' '),
            ],
          });
        });
        let wordMatch = levenshtain.compareStrings(
          teacherName,
          teachersDictionary,
        );
        console.log('la palabra: ', wordMatch);
        if (wordMatch[0] > 0.5) {
          let selectedTeacher = teachers.find(
            (teacher) => teacher.first_name === wordMatch[1],
          );
          await sendTextMessage(
            senderId,
            `Encontré estos datos del docente: ${selectedTeacher.first_name} ${selectedTeacher.last_name}: `,
          );
          await sendTextMessage(
            senderId,
            `✅ Correo: ${selectedTeacher.email}`,
          );
        } else {
          await sendTextMessage(
            senderId,
            'No encontré los datos del docente al que haces referencia, intenta preguntarme de la siguiente forma: ☑ contactos del docente + nombres docente',
          );
        }
      } catch (error) {
        console.log(error);
      }
      break;
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
          await db.getOneItem({ dni: teacher.dni, platform: 'F' }, ChatbotUser)
        ).payload;
        if (!teacherTelegram) {
          return sendTextMessage(
            senderId,
            'Lamentablemente tu tutor no se encuentra en mi lista de usuarios...',
          );
        }
        await sendTextMessage(
          teacherTelegram.platformId,
          `Buen día profesor ${teacher.first_name}, un tutorado desea comunicarse con usted\n` +
            `Sus datos son:\n` +
            `Código: ${user.studentCode}\n` +
            `Nombres: ${user.first_name}\n` +
            `Apellidos: ${user.last_name}`,
        );
        // send options
        await sendQuickReply(
          teacherTelegram.platformId,
          '¿Desea aceptar su solicitud?',
          [
            {
              content_type: 'text',
              title: 'Sí',
              payload: `yes_attend_student ${senderId}`,
            },
            {
              content_type: 'text',
              title: 'No',
              payload: `no_attend_student ${senderId}`,
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
          `✅Profesor {first_name}, ahora estás conectado con tu tutorado ${studentTelegramInfo.first_name} ${studentTelegramInfo.last_name}`,
        );
        await sendTextMessage(
          senderId,
          'Se redireccionarán los mensajes que escribas. Para finalizar, escribe FIN 👍',
        );
        // informar al estudiante que el tutor acepto la solicitud de contacto
        await sendTextMessage(
          studentTelegramId,
          `Alumno ${studentTelegramInfo.first_name}, tu tutor ${teacherTelegramInfo.first_name} ${teacherTelegramInfo.last_name} aceptó tu solicitud de contacto`,
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

    case 'Cursos.bibliografia.entity.action':
      try {
        let courseName = parameters.fields.courseName.stringValue;
        // if no parameter received
        if (validator.isEmpty(courseName)) {
          return handleMessages(messages, senderId);
        }
        let courses = (await db.filterItems({}, Course)).payload;
        // generating dictionary
        let coursesDictionary = [];
        courses.forEach((course) => {
          coursesDictionary.push({
            value: course.name,
            synonym: course.synonyms,
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
              {
                content_type: 'text',
                title: 'Sí',
                payload: `yes_match_course ${wordMatch[1]}`,
              },
              { content_type: 'text', title: 'No', payload: `no_match_course` },
            ],
          );
        }
      } catch (error) {
        console.log(error);
      }
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
            synonym: course.synonyms,
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
              {
                content_type: 'text',
                title: 'Sí',
                payload: `yes_match_course ${wordMatch[1]}`,
              },
              { content_type: 'text', title: 'No', payload: `no_match_course` },
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
            synonym: course.synonyms,
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
                content_type: 'text',
                title: 'Sí',
                payload: `yes_match_syllabus_course ${wordMatch[1]}`,
              },
              {
                content_type: 'text',
                title: 'No',
                payload: `no_match_syllabus_course`,
              },
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
      let replies = [];
      message.quickReplies.quickReplies.forEach((text) => {
        let reply = {
          content_type: 'text',
          title: text,
          payload: text,
        };
        replies.push(reply);
      });
      await sendQuickReply(sender, message.quickReplies.title, replies);
      break;
    case 'image': // image
      await sendImageMessage(sender, message.image.imageUri);
      break;
    case 'payload':
      let desestructPayload = structProtoToJson(message.payload);
      var messageData = {
        recipient: {
          id: sender,
        },
        message: desestructPayload.facebook,
      };
      await callSendAPI(messageData);
      break;
    default:
      break;
  }
}

async function handleCardMessages(messages, sender) {
  let elements = [];
  for (let m = 0; m < messages.length; m++) {
    let message = messages[m];
    let buttons = [];
    for (let b = 0; b < message.card.buttons.length; b++) {
      let isLink = message.card.buttons[b].postback.substring(0, 4) === 'http';
      let button;
      if (isLink) {
        button = {
          type: 'web_url',
          title: message.card.buttons[b].text,
          url: message.card.buttons[b].postback,
        };
      } else {
        button = {
          type: 'postback',
          title: message.card.buttons[b].text,
          payload: message.card.buttons[b].postback,
        };
      }
      buttons.push(button);
    }

    let element = {
      title: message.card.title,
      image_url: message.card.imageUri,
      subtitle: message.card.subtitle,
      buttons,
    };
    elements.push(element);
  }
  await sendGenericMessage(sender, elements);
}

async function handleMessages(messages, sender) {
  // console.log('los mensajes: ', JSON.stringify(messages, null, ' '));
  console.log('la cantidad: ', messages.length);
  try {
    let i = 0;
    let cards = [];
    while (i < messages.length) {
      switch (messages[i].message) {
        case 'card':
          for (let j = i; j < messages.length; j++) {
            if (messages[j].message === 'card') {
              cards.push(messages[j]);
              i += 1;
            } else j = 9999;
          }
          await handleCardMessages(cards, sender);
          cards = [];
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
      i += 1;
    }
  } catch (error) {
    console.log(error);
  }
}

async function sendToDialogFlow(senderId, messageText) {
  sendTypingOn(senderId);
  try {
    let result;
    setSessionAndUser(senderId);
    let session = sessionIds.get(senderId);
    result = await dialogflow.sendToDialogFlow(
      messageText,
      session,
      'FACEBOOK',
    );
    // }

    handleDialogFlowResponse(senderId, result);
  } catch (error) {
    console.log('salio mal en sendToDialogflow...', error);
  }
}

async function handleDialogFlowResponse(sender, response) {
  let responseText = response.fulfillmentMessages.fulfillmentText;

  let messages = response.fulfillmentMessages;
  let { action } = response;
  let contexts = response.outputContexts;
  let { parameters } = response;
  let intentName = response.intent.displayName;

  // check DNI
  let documentNum = await verifyDocumentNum(sender);
  if (!isDefined(documentNum)) {
    if (
      intentName !== 'GetStarted' &&
      intentName !== 'GetStarted.docente' &&
      intentName !== 'GetStarted.estudiante' &&
      intentName !== 'GetStarted.foraneo'
    ) {
      console.log('no habia dni y se pedira..');
      return sendToDialogFlow(sender, 'GetStarted');
    }
  }

  sendTypingOff(sender);

  if (isDefined(action)) {
    handleDialogFlowAction(sender, action, messages, contexts, parameters);
  } else if (isDefined(messages)) {
    handleMessages(messages, sender);
  } else if (responseText == '' && !isDefined(action)) {
    // dialogflow could not evaluate input.
    sendTextMessage(
      sender,
      "I'm not sure what you want. Can you be more specific?",
    );
  } else if (isDefined(responseText)) {
    sendTextMessage(sender, responseText);
  }
}

async function getUserDataFacebook(senderID) {
  console.log('consiguiendo datos del usuario');
  let access_token = process.env.FB_PAGE_TOKEN;
  try {
    let userData = await axios.get(
      `https://graph.facebook.com/v6.0/${senderID}`,
      {
        params: {
          access_token,
        },
      },
    );
    return userData.data;
  } catch (err) {
    console.log('algo salio mal en axios getUserData: ', err);
    return {
      first_name: '',
      last_name: '',
      profile_pic: '',
    };
  }
}

async function getUserData(senderId) {
  let userInfo = {
    first_name: '',
    last_name: '',
    studentCode: '',
    attending: '',
    attendingPlatform: '',
    dni: '',
    type: '',
    platformId: '',
  };
  try {
    let res = await db.filterItems({ platformId: senderId }, ChatbotUser);
    userInfo.first_name = res.payload[0].first_name;
    userInfo.last_name = res.payload[0].last_name;
    userInfo.studentCode = res.payload[0].studentCode;
    userInfo.attending = res.payload[0].attending;
    userInfo.attendingPlatform = res.payload[0].attendingPlatform;
    userInfo.dni = res.payload[0].dni;
    userInfo.studentCode = res.payload[0].studentCode;
    userInfo.type = res.payload[0].type;
    userInfo.platformId = res.payload[0].platformId;
  } catch (error) {
    throw error;
  }
  return userInfo;
}

async function sendTextMessage(senderId, text) {
  if (text.includes('{first_name}') || text.includes('{{last_name}}')) {
    let userData = await getUserData(senderId);
    text = text
      .replace('{first_name}', userData.first_name)
      .replace('{{last_name}}', userData.last_name);
  }
  if (text.includes('{tutor_fullname}')) {
    let teacher = await getTeacherInfo(senderId);
    text = text.replace(
      '{tutor_fullname}',
      `${teacher.first_name} ${teacher.last_name}`,
    );
  }
  let messageData = {
    recipient: {
      id: senderId,
    },
    message: {
      text,
    },
  };
  await callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
async function sendImageMessage(recipientId, imageUrl) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'image',
        payload: {
          url: imageUrl,
        },
      },
    },
  };

  await callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'image',
        payload: {
          url: `${process.env.SERVER_URL}/assets/instagram_logo.gif`,
        },
      },
    },
  };

  callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'audio',
        payload: {
          url: `${process.env.SERVER_URL}/assets/sample.mp3`,
        },
      },
    },
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'video',
        payload: {
          url: process.env.SERVER_URL + videoName,
        },
      },
    },
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'file',
        payload: {
          url: process.env.SERVER_URL + fileName,
        },
      },
    },
  };

  callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text,
          buttons,
        },
      },
    },
  };

  callSendAPI(messageData);
}

async function sendGenericMessage(recipientId, elements) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements,
        },
      },
    },
  };

  await callSendAPI(messageData);
}

function sendReceiptMessage(
  recipientId,
  recipient_name,
  currency,
  payment_method,
  timestamp,
  elements,
  address,
  summary,
  adjustments,
) {
  // Generate a random receipt ID as the API requires a unique ID
  let receiptId = `order${Math.floor(Math.random() * 1000)}`;

  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'receipt',
          recipient_name,
          order_number: receiptId,
          currency,
          payment_method,
          timestamp,
          elements,
          address,
          summary,
          adjustments,
        },
      },
    },
  };

  callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
async function sendQuickReply(recipientId, text, replies, metadata) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      text,
      metadata: isDefined(metadata) ? metadata : '',
      quick_replies: replies,
    },
  };

  await callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    sender_action: 'mark_seen',
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    sender_action: 'typing_on',
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    sender_action: 'typing_off',
  };

  callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
  let messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: 'Welcome. Link your account.',
          buttons: [
            {
              type: 'account_link',
              url: `${process.env.SERVER_URL}/authorize`,
            },
          ],
        },
      },
    },
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
  return new Promise((resolve, reject) => {
    request(
      {
        uri: 'https://graph.facebook.com/v3.2/me/messages',
        qs: {
          access_token: process.env.FB_PAGE_TOKEN,
        },
        method: 'POST',
        json: messageData,
      },
      (error, response, body) => {
        if (!error && response.statusCode == 200) {
          let recipientId = body.recipient_id;
          let messageId = body.message_id;

          if (messageId) {
            console.log(
              'Successfully sent message with id %s to recipient %s',
              messageId,
              recipientId,
            );
          } else {
            console.log(
              'Successfully called Send API for recipient %s',
              recipientId,
            );
          }
          resolve();
        } else {
          reject();
          console.error(
            'Failed calling Send API',
            response.statusCode,
            response.statusMessage,
            body.error,
          );
        }
      },
    );
  });
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
async function receivedPostback(event) {
  let senderID = event.sender.id;
  let recipientID = event.recipient.id;
  let timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  let { payload } = event.postback;
  let result;
  console.log('se recibio este postabck: ', payload);
  switch (payload) {
    default:
      // unindentified payload
      sendToDialogFlow(senderID, payload);
      // sendTextMessage(senderID, "I'm not sure what you want. Can you be more specific?");
      break;
  }

  console.log(
    "Received postback for user %d and page %d with payload '%s' " + 'at %d',
    senderID,
    recipientID,
    payload,
    timeOfPostback,
  );
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 *
 */
function receivedMessageRead(event) {
  let senderID = event.sender.id;
  let recipientID = event.recipient.id;

  // All messages before watermark (a timestamp) or sequence have been seen.
  let { watermark } = event.read;
  let sequenceNumber = event.read.seq;

  console.log(
    'Received message read event for watermark %d and sequence ' + 'number %d',
    watermark,
    sequenceNumber,
  );
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 *
 */
function receivedAccountLink(event) {
  let senderID = event.sender.id;
  let recipientID = event.recipient.id;

  let { status } = event.account_linking;
  let authCode = event.account_linking.authorization_code;

  console.log(
    'Received account link event with for user %d with status %s ' +
      'and auth code %s ',
    senderID,
    status,
    authCode,
  );
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  let senderID = event.sender.id;
  let recipientID = event.recipient.id;
  let { delivery } = event;
  let messageIDs = delivery.mids;
  let { watermark } = delivery;
  let sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach((messageID) => {
      console.log(
        'Received delivery confirmation for message ID: %s',
        messageID,
      );
    });
  }

  console.log('All message before %d were delivered.', watermark);
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
  let senderID = event.sender.id;
  let recipientID = event.recipient.id;
  let timeOfAuth = event.timestamp;

  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger'
  // plugin.
  let passThroughParam = event.optin.ref;

  console.log(
    'Received authentication for user %d and page %d with pass ' +
      "through param '%s' at %d",
    senderID,
    recipientID,
    passThroughParam,
    timeOfAuth,
  );

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendTextMessage(senderID, 'Authentication successful');
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  let signature = req.headers['x-hub-signature'];
  console.log('la firma: ', signature);
  if (!signature) {
    throw new Error("Couldn't validate the signature.");
  } else {
    let elements = signature.split('=');
    let method = elements[0];
    let signatureHash = elements[1];

    let expectedHash = crypto
      .createHmac('sha1', process.env.FB_APP_SECRET)
      .update(buf)
      .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

function isDefined(obj) {
  if (typeof obj === 'undefined') {
    return false;
  }

  if (!obj) {
    return false;
  }

  return obj != null;
}

// // Spin up the server
// app.listen(app.get('port'), function () {
//     console.log('running on port', app.get('port'))
// })

module.exports = router;
