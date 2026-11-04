# Video Studio

Video Studio collects watchable programmes from Vakyartha apps into a personal library. It uses the shared Listen and Watch player: the person's selected Vakyartha voice reads each scene while Watch shows its source picture, captions, charts, figures and credits.

## Use it

Choose a source in Creator Studio and select **Import latest programme**. News Desk, Market Terminal, Weather Desk and Wish Radar return their own saved programme through read-only in-process MCP tools. Video Studio saves a local draft with the source app and import time. Refresh the source app first if it has no saved programme.

Review a draft before **Add to library**. Creator Studio keeps the storyboard beside the programme inspector on wide windows and stacks them on narrow windows. Search and local paging keep longer scene and draft collections easy to browse. Edit its title, scene heading and narration, or make a Short from one scene; unsaved narration edits are carried into the new short. The creator skill can also use the shared assistant pipeline to propose a source-aware show or short; its saved result remains a draft until you accept it into the library. The app's Listen and Watch controls use the same programme and the shared voice settings.

## Data and boundaries

The app owns saved programme records in its normal app state. A record keeps its source name, local import time, source checked time when supplied, scene text, attribution, dates, image links and programme figures returned by the source. It does not copy source app databases or refresh them in the background. Import is explicit and reads one selected source per action. The library holds up to 100 records and 8 MB of content, with at most 80 scenes per show and 4,000 characters of narration per scene. A short may have at most two scenes and 120 spoken words; runtime varies with the selected voice. Remove a record from Video Studio to make room; source apps and shared media are unchanged.

These are saved watchable programmes, not rendered MP4 files. TTS happens through Vakyartha's shared Listen and Watch player; generated audio is not saved as an asset. There is no external feed, account, posting, reactions, follower graph or upload. Short is a concise one-scene cut in the host's existing Watch presentation; it does not create a separate video format or promise a fixed runtime.

Only apps with an exported watchable-programme tool are available in this version: News Desk, Market Terminal, Weather Desk and Wish Radar. The catalog treats declared app tools as package requirements, so the built-in catalog package requires all four source apps to be present; a person's per-tool Access choices can still deny any individual read. Other apps can join when they export a suitable read-only programme. Missing, disabled or empty sources remain unavailable; Video Studio never fills them with sample data.

## Access and background

The four source reads are optional and read-only. Review them in the shared app Access shield. Video Studio declares no schedule and does not run in the background. A generated assistant proposal uses the existing provider, skill and approval path. Adding a draft to the library is a local personal action and does not publish it.

## Verification

The backend tests cover programme validation, source import, draft review, scene editing, short creation and saved-state rendering. Source values and playback still need a live WebKit journey with the source apps enabled; the package itself cannot prove the provider's spoken audio quality.
