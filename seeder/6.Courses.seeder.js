const faker = require('faker');

const json = [];

module.exports = new Promise(async (resolve) => {
  // GET FOREIGN IDS
  const { Random } = require('../helpers/utils');
  let cycles = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  let material = [];
  for (let i = 0; i < 6; i++) {
    material.push({ name: faker.lorem.word(), url: faker.internet.url() });
  }
  // GET DATA
  for (let i = 0; i < 62; i++) {
    json.push({
      name: faker.lorem.words(),
      cycle: cycles[Random(0, cycles.length - 1)],
      credit: faker.random.number(6),
      material,
      syllabys: faker.internet.url,
    });
  }
  // END DATA
  resolve(json);
});
