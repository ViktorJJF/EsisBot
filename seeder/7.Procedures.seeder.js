const faker = require('faker');

const json = [];

module.exports = new Promise(async (resolve) => {
  // GET FOREIGN IDS
  // GET DATA
  for (let i = 0; i < 120; i++) {
    let procedureName = faker.lorem.words();
    json.push({
      name: procedureName,
      requirements: faker.lorem.paragraph(),
      attendant: faker.name.jobArea(),
      synonyms: [procedureName],
    });
  }
  // END DATA
  resolve(json);
});
