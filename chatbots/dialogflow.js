const dialogflow = require('dialogflow');

const credentials = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY,
};

const sessionClient = new dialogflow.SessionsClient({
  projectId: process.env.GOOGLE_PROJECT_ID,
  credentials,
});

/**
 * Send a query to the dialogflow agent, and return the query result.
 * @param {string} projectId The project to be used
 */
async function sendToDialogFlow(msg, session, source, params) {
  let textToDialogFlow = msg;
  try {
    const sessionPath = sessionClient.sessionPath(
      process.env.GOOGLE_PROJECT_ID,
      session,
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: textToDialogFlow,
          languageCode: process.env.DF_LANGUAGE_CODE,
        },
      },
      queryParams: {
        payload: {
          data: params,
        },
      },
    };
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    let defaultResponses = [];
    if (result.action !== 'input.unknown') {
      result.fulfillmentMessages.forEach((element) => {
        if (element.platform === source) {
          defaultResponses.push(element);
        }
      });
    }
    if (defaultResponses.length > 0) {
      result.fulfillmentMessages = defaultResponses;
      return result;
    }
    return result;
    // console.log("se enviara el resultado: ", result);
  } catch (e) {
    console.log('error');
    console.log(e);
  }
}

module.exports = {
  sendToDialogFlow,
};
