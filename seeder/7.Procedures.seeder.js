const faker = require('faker');

const json = [];

module.exports = new Promise(async (resolve) => {
  // GET FOREIGN IDS
  // GET DATA
  for (let i = 0; i < 120; i++) {
    json.push({
      name: faker.lorem.words(),
      requirements: faker.lorem.paragraph(),
      attendant: faker.name.jobArea(),
    });
  }
  // END DATA
  resolve(json);
});
