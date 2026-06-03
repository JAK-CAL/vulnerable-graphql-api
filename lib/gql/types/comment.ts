import { GraphQLObjectType, GraphQLString, GraphQLBoolean, GraphQLID, GraphQLFieldConfig, GraphQLList } from 'graphql'
import { UserType } from './user';
import { db } from '../../../models';

async function resolveAuthor(root: any) {
    let user = await root.getUser();
    return user;
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

export var GetAllComments: GraphQLFieldConfig<any,any,any> = {
    type: new GraphQLList(CommentType),
    resolve: async () => {
        let comments = await db.Comment.findAll();
        return comments;
    }
}
