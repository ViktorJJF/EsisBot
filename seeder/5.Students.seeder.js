const faker = require('faker');

const json = [];

module.exports = new Promise(async (resolve) => {
  // GET FOREIGN IDS
  const { selectRandomId, Random } = require('../helpers/utils');
  const Teacher = require('../models/Teachers');
  const teachers = await Teacher.find();
  let cycles = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  // GET DATA
  // for (let i = 0; i < 315; i++) {
  json.push({
    first_name: 'Victor Juan',
    last_name: 'Jimenez Flores',
    phone: '983724514',
    studentCode: '2013-39098',
    email: 'vjimenezf@gmail.com',
    profile_pic: faker.internet.avatar(),
    teacherId: selectRandomId(teachers),
    cycle: cycles[Random(0, cycles.length - 1)],
  });
  // }
  // END DATA
  resolve(json);
});
