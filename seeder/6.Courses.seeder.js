const faker = require('faker');

let material = [];
for (let i = 0; i < 6; i++) {
  material.push({ name: faker.lorem.word(), url: faker.internet.url() });
}
const json = [
  {
    name: 'MATEMÁTICA',
    cycle: 'I',
    credit: '',
    material,
    syllabus: faker.internet.url(),
  },
  {
    name: 'FUNDAMENTOS DE PROGRAMACIÓN',
    cycle: 'I',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'COMUNICACIÓN Y REDACCIÓN',
    cycle: 'I',
    credit: '',
    material,
    syllabus: faker.internet.url(),
  },
  {
    name: 'MATEMÁTICA DISCRETA I',
    cycle: 'I',
    credit: '',
    material,
    syllabus: faker.internet.url(),
  },
  {
    name: 'METODOLOGÍA DEL TRABAJO UNVIIERSITARIO',
    cycle: 'I',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'QUÍMICA',
    cycle: 'I',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'PROGRAMACIÓN GRÁFICA',
    cycle: 'I',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'Matemática III',
    cycle: 'III',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'Teoría General de Sistemas',
    cycle: 'III',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'Teoría General de Sistemas',
    cycle: 'III',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'ESTADISTICA Y PROBABILIDADES',
    cycle: 'III',
    credit: '',
    material,
    syllabus: faker.internet.url(),
  },
  {
    name: 'ESTRUCTURA DE DATOS',
    cycle: 'III',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'ALGORITMOS Y PROGRAMACIÓN PARALELA',
    cycle: 'III',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'SISTEMAS ELÉCTRICOS Y ELECTRÓNICOS',
    cycle: 'III',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'COMPILADORES Y TEORÍA DE LENGUAJES',
    cycle: 'V',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'ARQUITECTURA DE COMPUTADORES',
    cycle: 'V',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'BASE DE DATOS I ',
    cycle: 'V',
    credit: '',
    material,
    syllabus: faker.internet.url(),
  },
  {
    name: 'Diseño de Sistemas',
    cycle: 'V',
    credit: '',
    material,
    syllabus: faker.internet.url(),
  },
  {
    name: 'INVESTIGACIÓN DE OPERACIONES I',
    cycle: 'V',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'GESTIÓN EMPRESARIAL',
    cycle: 'VII',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'TELEMÁTICA',
    cycle: 'VII',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'DINÁMICA DE SISTEMAS',
    cycle: 'VII',
    credit: '',
    material,
    syllabus: faker.internet.url(),
  },
  {
    name: 'SISTEMAS DE INFORMACIÓN',
    cycle: 'VII',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'Ingeniería de Software II',
    cycle: 'VII',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'LEGISLACIÓN INDUSTRIAL E INFORMÁTICA',
    cycle: 'VII',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'TALLER DE TESIS I',
    cycle: 'IX',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'REALIDAD VIRTUAL',
    cycle: 'IX',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'SISTEMAS EXPERTOS',
    cycle: 'IX',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'PROCESAMIENTO DE IMÁGENES',
    cycle: 'IX',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'PRÁCTICAS PRE-PROFESIONALES',
    cycle: 'IX',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
  {
    name: 'ELECTIVO II',
    cycle: 'IX',
    credit: '',
    material: [],
    syllabus: faker.internet.url(),
  },
];

module.exports = new Promise(async (resolve) => {
  resolve(json);
});
