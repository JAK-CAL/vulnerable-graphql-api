import {GraphQLObjectType} from 'graphql'

import {SecretMutation} from '../mutations/secret_mutation'
import { CreatePost } from '../mutations/create_post';
import { UpdatePost, DeletePost, SecureUpdatePost, SecureDeletePost } from '../mutations/update_post';
import { CreateComment, UpdateComment, DeleteComment, SecureUpdateComment, SecureDeleteComment } from '../mutations/comment_mutations';
import { Register, Login, PasswordReset } from '../mutations/authentication';

export var MutationType = new GraphQLObjectType({
    name: "RootMutation",
    fields: {
        register: Register,
        login: Login,
        passwordReset: PasswordReset,

        createPost: CreatePost,
        updatePost: UpdatePost,
        deletePost: DeletePost,
        secureUpdatePost: SecureUpdatePost,
        secureDeletePost: SecureDeletePost,
        createComment: CreateComment,
        updateComment: UpdateComment,
        deleteComment: DeleteComment,
        secureUpdateComment: SecureUpdateComment,
        secureDeleteComment: SecureDeleteComment,
        superSecretPrivateMutation: SecretMutation
    }
});
