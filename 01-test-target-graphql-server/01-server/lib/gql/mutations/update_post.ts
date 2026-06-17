import { GraphQLFieldConfig, GraphQLString, GraphQLBoolean, GraphQLID } from "graphql";
import { PostType } from "../types/post";

import {db} from '../../../models';

export var UpdatePost: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID,
        },
        title: {
            type: GraphQLString,
        },
        content: {
            type: GraphQLString
        },
        public: {
            type: GraphQLBoolean
        }
    },
    resolve: async (_root: any, args: any, _context: any) => {
        let post = await db.Post.findByPk(args.id);
        if (!post) {
            return null;
        }

        // Intentionally vulnerable lab behavior: no owner check and deleted posts can still be modified.
        if (args.title !== undefined) {
            post.title = args.title;
        }
        if (args.content !== undefined) {
            post.content = args.content;
        }
        if (args.public !== undefined) {
            post.public = args.public;
        }
        await post.save();
        return post;
    }
}

export var SecureUpdatePost: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID,
        },
        title: {
            type: GraphQLString,
        },
        content: {
            type: GraphQLString
        },
        public: {
            type: GraphQLBoolean
        }
    },
    resolve: async (_root: any, args: any, context: any) => {
        let post = await db.Post.findByPk(args.id);
        if (!post || !context.user || String(post.UserId) !== String(context.user.id) || post.deleted === true) {
            return null;
        }

        if (args.title !== undefined) {
            post.title = args.title;
        }
        if (args.content !== undefined) {
            post.content = args.content;
        }
        if (args.public !== undefined) {
            post.public = args.public;
        }
        await post.save();
        let sanitized = post.toJSON ? post.toJSON() : Object.assign({}, post);
        sanitized.internalNote = null;
        return sanitized;
    }
}

export var DeletePost: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID,
        }
    },
    resolve: async (_root: any, args: any, _context: any) => {
        let post = await db.Post.findByPk(args.id);
        if (!post) {
            return null;
        }

        // Soft delete creates a stale-object lab case because read/update resolvers do not enforce lifecycle state.
        post.deleted = true;
        await post.save();
        return post;
    }
}

export var SecureDeletePost: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID,
        }
    },
    resolve: async (_root: any, args: any, context: any) => {
        let post = await db.Post.findByPk(args.id);
        if (!post || !context.user || String(post.UserId) !== String(context.user.id) || post.deleted === true) {
            return null;
        }

        post.deleted = true;
        await post.save();
        let sanitized = post.toJSON ? post.toJSON() : Object.assign({}, post);
        sanitized.internalNote = null;
        return sanitized;
    }
}
