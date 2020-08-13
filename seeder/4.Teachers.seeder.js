const faker = require('faker');

const json = [];

module.exports = new Promise(async (resolve) => {
  // GET FOREIGN IDS
  // GET DATA
  for (let i = 0; i < 18; i++) {
    json.push({
      first_name: faker.name.firstName(),
      last_name: faker.name.lastName(),
      phone: faker.phone.phoneNumberFormat(),
      email: faker.internet.email(),
      platformId: faker.commerce.price(1000000, 2000000),
      profile_pic: faker.internet.avatar(),
    });
  }
  // END DATA
  resolve(json);
});
