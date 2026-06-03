import { GraphQLFieldConfig, GraphQLString, GraphQLBoolean, GraphQLID } from "graphql";
import { CommentType } from "../types/comment";

import {db} from '../../../models';

export var CreateComment: GraphQLFieldConfig<any,any,any> = {
    type: CommentType,
    args: {
        postId: {
            type: GraphQLID,
        },
        body: {
            type: GraphQLString
        },
        public: {
            type: GraphQLBoolean,
            defaultValue: true
        }
    },
    resolve: async (_root: any, args: any, context: any) => {
        let postId = args.postId || 1;
        let comment = await db.Comment.create({
            UserId: context.user.id,
            PostId: postId,
            body: args.body,
            public: args.public,
            deleted: false,
            moderationNote: 'moderator-only comment note'
        }, {});
        return comment;
    }
}

export var UpdateComment: GraphQLFieldConfig<any,any,any> = {
    type: CommentType,
    args: {
        id: {
            type: GraphQLID,
        },
        body: {
            type: GraphQLString
        },
        public: {
            type: GraphQLBoolean
        }
    },
    resolve: async (_root: any, args: any, _context: any) => {
        let comment = await db.Comment.findByPk(args.id);
        if (!comment) {
            return null;
        }

        // Intentionally vulnerable lab behavior: any actor can update any comment, including deleted ones.
        if (args.body !== undefined) {
            comment.body = args.body;
        }
        if (args.public !== undefined) {
            comment.public = args.public;
        }
        await comment.save();
        return comment;
    }
}

export var DeleteComment: GraphQLFieldConfig<any,any,any> = {
    type: CommentType,
    args: {
        id: {
            type: GraphQLID,
        }
    },
    resolve: async (_root: any, args: any, _context: any) => {
        let comment = await db.Comment.findByPk(args.id);
        if (!comment) {
            return null;
        }

        comment.deleted = true;
        await comment.save();
        return comment;
    }
}
