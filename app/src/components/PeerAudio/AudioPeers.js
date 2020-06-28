import React from 'react';
import { connect } from 'react-redux';
import { micConsumerSelector } from '../Selectors';
import PropTypes from 'prop-types';
import PeerAudio from './PeerAudio';

const AudioPeers = (props) =>
{
	const {
    peers,
		micConsumers
	} = props;

  const getAudioVolume = (peerId) =>
    peerId && peers[peerId] ? peers[peerId].audioVolume : 1.0

	return (
		<div data-component='AudioPeers'>
			{
				micConsumers.map((micConsumer) =>
				{
					return (
						<PeerAudio
							key={micConsumer.id}
							audioTrack={micConsumer.track}
              audioVolume={getAudioVolume(micConsumer.peerId)}
						/>
					);
				})
			}
		</div>
	);
};

AudioPeers.propTypes =
{
  peers: PropTypes.object,
	micConsumers : PropTypes.array
};

const mapStateToProps = (state) =>
	({
    peers: state.peers,
		micConsumers : micConsumerSelector(state)
	});

const AudioPeersContainer = connect(
	mapStateToProps,
	null,
	null,
	{
		areStatesEqual : (next, prev) =>
		{
			return (
				prev.consumers === next.consumers
        &&
        prev.peers === next.peers
			);
		}
	}
)(AudioPeers);

export default AudioPeersContainer;
