'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.addColumn('Posts', 'deleted', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      }),
      queryInterface.addColumn('Posts', 'internalNote', {
        type: Sequelize.STRING,
        defaultValue: 'moderation-only post note'
      })
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('Posts', 'deleted'),
      queryInterface.removeColumn('Posts', 'internalNote')
    ]);
  }
};
