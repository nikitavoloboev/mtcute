import { BaseTelegramClient } from '@mtcute/core'

import { InputPeerLike } from '../../types'
import { isInputPeerChannel, isInputPeerUser, normalizeToInputChannel, normalizeToInputUser } from '../../utils'
import { getAuthState } from '../auth/_state'
import { resolvePeer } from '../users/resolve-peer'

/**
 * Reorder usernames
 *
 * @param peerId  Bot, channel or "me"/"self"
 */
export async function reorderUsernames(
    client: BaseTelegramClient,
    peerId: InputPeerLike,
    order: string[],
): Promise<void> {
    const peer = await resolvePeer(client, peerId)

    if (isInputPeerUser(peer)) {
        // either a bot or self

        if (peer._ === 'inputPeerSelf' || peer.userId === getAuthState(client).userId) {
            // self
            await client.call({
                _: 'account.reorderUsernames',
                order,
            })

            return
        }

        // bot
        await client.call({
            _: 'bots.reorderUsernames',
            bot: normalizeToInputUser(peer, peerId),
            order,
        })
    } else if (isInputPeerChannel(peer)) {
        await client.call({
            _: 'channels.reorderUsernames',
            channel: normalizeToInputChannel(peer, peerId),
            order,
        })
    }
}