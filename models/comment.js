'use strict';
module.exports = (sequelize, DataTypes) => {
  const Comment = sequelize.define('Comment', {
    body: DataTypes.TEXT,
    public: DataTypes.BOOLEAN,
    deleted: DataTypes.BOOLEAN,
    moderationNote: DataTypes.STRING
  }, {
    timestamps: false
  });
  Comment.associate = function(models) {
    Comment.belongsTo(models.User);
    Comment.belongsTo(models.Post);
  };
  return Comment;
};
