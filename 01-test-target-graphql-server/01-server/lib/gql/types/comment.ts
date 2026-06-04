import { GraphQLObjectType, GraphQLString, GraphQLBoolean, GraphQLID, GraphQLFieldConfig, GraphQLList } from 'graphql'
import { UserType } from './user';
import { db } from '../../../models';

async function resolveAuthor(root: any) {
    let user = await root.getUser();
    return user;
}

function sanitizeComment(comment: any): any {
    if (!comment) {
        return null;
    }
    let sanitized = comment.toJSON ? comment.toJSON() : Object.assign({}, comment);
    sanitized.moderationNote = null;
    return sanitized;
}

function canReadComment(comment: any, context: any): boolean {
    if (!comment) {
        return false;
    }
    let currentUserId = context && context.user ? String(context.user.id) : null;
    let ownerId = comment.UserId !== undefined && comment.UserId !== null ? String(comment.UserId) : null;
    return (!!ownerId && currentUserId === ownerId) || (comment.public === true && comment.deleted !== true);
}

export var CommentType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Comment',
    fields: () => ({
        id: {
            type: GraphQLID
        },
        body: {
            type: GraphQLString
        },
        public: {
            type: GraphQLBoolean
        },
        deleted: {
            type: GraphQLBoolean
        },
        moderationNote: {
            type: GraphQLString
        },
        author: {
            type: UserType,
            resolve: resolveAuthor
        }
    })
});

export var GetCommentById: GraphQLFieldConfig<any,any,any> = {
    type: CommentType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, _info) => {
        let comment = await db.Comment.findByPk(args.id);
        return comment;
    }
}

export var SecureGetCommentById: GraphQLFieldConfig<any,any,any> = {
    type: CommentType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, context) => {
        let comment = await db.Comment.findByPk(args.id);
        if (!canReadComment(comment, context)) {
            return null;
        }
        return sanitizeComment(comment);
    }
}

export var CommentPreview: GraphQLFieldConfig<any,any,any> = {
    type: CommentType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, context) => {
        let comment = await db.Comment.findByPk(args.id);
        if (!canReadComment(comment, context)) {
            return null;
        }
        return sanitizeComment(comment);
    }
}

export var OwnerCommentHistory: GraphQLFieldConfig<any,any,any> = {
    type: CommentType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, context) => {
        let comment = await db.Comment.findByPk(args.id);
        if (!comment || !context.user || String(comment.UserId) !== String(context.user.id)) {
            return null;
        }
        return sanitizeComment(comment);
    }
}

export var GetAllComments: GraphQLFieldConfig<any,any,any> = {
    type: new GraphQLList(CommentType),
    resolve: async () => {
        let comments = await db.Comment.findAll();
        return comments;
    }
}

export var PublicComments: GraphQLFieldConfig<any,any,any> = {
    type: new GraphQLList(CommentType),
    resolve: async () => {
        let comments = await db.Comment.findAll({where: {public: true, deleted: false}});
        return comments.map(sanitizeComment);
    }
}
