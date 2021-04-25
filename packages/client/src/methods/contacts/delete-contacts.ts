import { TelegramClient } from '../../client'
import { MaybeArray } from '@mtcute/core'
import { InputPeerLike, MtCuteInvalidPeerTypeError, MtCuteTypeAssertionError, User } from '../../types'
import { normalizeToInputUser } from '../../utils/peer-utils'
import { tl } from '@mtcute/tl'

/**
 * Delete a single contact from your Telegram contacts list
 *
 * Returns deleted contact's profile or `null` in case
 * that user was not in your contacts list
 *
 * @param userId  User ID, username or phone number
 * @internal
 */
export async function deleteContacts(
    this: TelegramClient,
    userId: InputPeerLike
): Promise<User | null>

/**
 * Delete one or more contacts from your Telegram contacts list
 *
 * Returns deleted contact's profiles. Does not return
 * profiles of users that were not in your contacts list
 *
 * @param userIds  User IDs, usernames or phone numbers
 * @internal
 */
export async function deleteContacts(
    this: TelegramClient,
    userIds: InputPeerLike[]
): Promise<User[]>

/** @internal */
export async function deleteContacts(
    this: TelegramClient,
    userIds: MaybeArray<InputPeerLike>
): Promise<MaybeArray<User> | null> {
    const single = !Array.isArray(userIds)
    if (single) userIds = [userIds as InputPeerLike]

    const inputPeers = ((
        await Promise.all(
            (userIds as InputPeerLike[]).map((it) =>
                this.resolvePeer(it).then(normalizeToInputUser)
            )
        )
    ).filter(Boolean) as unknown) as tl.TypeInputUser[]

    if (single && !inputPeers.length)
        throw new MtCuteInvalidPeerTypeError(
            (userIds as InputPeerLike[])[0],
            'user'
        )

    const res = await this.call({
        _: 'contacts.deleteContacts',
        id: inputPeers
    })

    if (!(res._ === 'updates' || res._ === 'updatesCombined'))
        throw new MtCuteTypeAssertionError(
            'addContact',
            'updates | updatesCombined',
            res._
        )

    if (single && !res.updates.length) return null

    this._handleUpdate(res)

    const users = res.users.map(user => new User(this, user as tl.RawUser))

    return single ? users[0] : users
}