import { GraphQLObjectType, GraphQLString, GraphQLBoolean, GraphQLID, GraphQLFieldConfig, GraphQLList } from 'graphql'
import { UserType } from './user';
import { db } from '../../../models';
import { CommentType } from './comment';

async function resolveAuthor(root: any) {
    let user = await root.getUser();
    return user;
}

export var PostType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Post',
    fields: () => ({
        id: {
            type: GraphQLID
        },
        title: {
            type: GraphQLString
        },
        content: {
            type: GraphQLString
        },
        public: {
            type: GraphQLBoolean
        },
        deleted: {
            type: GraphQLBoolean
        },
        internalNote: {
            type: GraphQLString
        },

        author: {
            type: UserType,
            resolve: resolveAuthor
        },
        comments: {
            type: new GraphQLList(CommentType),
            resolve: async (root: any) => {
                let comments = await root.getComments();
                return comments;
            }
        }
    })
});


export var GetPostById: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, _info) => {
        let post = await db.Post.findByPk(args.id);
        return post;
    }
}

export var SecureGetPostById: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, context) => {
        let post = await db.Post.findByPk(args.id);
        if (!post) {
            return null;
        }

        let currentUserId = context && context.user ? String(context.user.id) : null;
        let ownerId = post.UserId !== undefined && post.UserId !== null ? String(post.UserId) : null;
        if (ownerId && currentUserId === ownerId) {
            return post;
        }

        if (post.public === true && post.deleted !== true) {
            let sanitized = post.toJSON ? post.toJSON() : Object.assign({}, post);
            sanitized.internalNote = null;
            return sanitized;
        }

        return null;
    }
}

export var Search: GraphQLFieldConfig<any,any,any> = {
    type: new GraphQLList(PostType),
    args: {
        query: {
           type: GraphQLString 
        }
    },
    resolve: async (_root, args, _context) => {
        let arg = args.query;
        let query = `SELECT * FROM posts WHERE public=1 AND content LIKE '%${arg}%'`
        let posts = db.sequelize.query(query, {model: db.Post, mapToModel: true})
        return posts;
    }
}
