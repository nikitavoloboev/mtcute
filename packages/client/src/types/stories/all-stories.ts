import { tl } from '@mtcute/core'

import { makeInspectable } from '../../utils'
import { memoizeGetters } from '../../utils/memoize'
import { PeersIndex } from '../peers'
import { PeerStories } from './peer-stories'
import { StoriesStealthMode } from './stealth-mode'

/**
 * All stories of the current user
 *
 * Returned by {@link TelegramClient.getAllStories}
 */
export class AllStories {
    constructor(readonly raw: tl.stories.RawAllStories) {}

    readonly _peers = PeersIndex.from(this.raw)

    /** Whether there are more stories to fetch */
    get hasMore(): boolean {
        return this.raw.hasMore!
    }

    /** Next offset for pagination */
    get next(): string {
        return this.raw.state
    }

    /** Total number of {@link PeerStories} available */
    get total(): number {
        return this.raw.count
    }

    /** Peers with their stories */
    get peerStories(): PeerStories[] {
        return this.raw.peerStories.map((it) => new PeerStories(it, this._peers))
    }

    /** Stealth mode info */
    get stealthMode(): StoriesStealthMode | null {
        return new StoriesStealthMode(this.raw.stealthMode)
    }
}

memoizeGetters(AllStories, ['peerStories', 'stealthMode'])
makeInspectable(AllStories)