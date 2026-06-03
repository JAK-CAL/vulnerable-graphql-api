'use strict';
module.exports = (sequelize, DataTypes) => {
  const Post = sequelize.define('Post', {
    title: DataTypes.STRING,
    content: DataTypes.TEXT,
    public: DataTypes.BOOLEAN,
    deleted: DataTypes.BOOLEAN,
    internalNote: DataTypes.STRING
  }, {
    timestamps: false
  });
  Post.associate = function(models) {
    // associations can be defined here
    Post.belongsTo(models.User);
    Post.hasMany(models.Comment);
  };
  return Post;
};
