import React from 'react';
import PropTypes from 'prop-types';

export default class PeerAudio extends React.PureComponent
{
  constructor(props)
  {
    super(props);

    // Latest received audio track.
    // @type {MediaStreamTrack}
    this._audioTrack = null;
    this.ref = React.createRef();
  }

  render()
  {
    return (
      <audio
        ref={this.ref}
        autoPlay
      />
    );
  }

  componentDidMount()
  {
    const { audioTrack } = this.props;

    this._setTrack(audioTrack);
  }

  componentDidUpdate(prevProps) {
    const { audioTrack, audioVolume } = this.props;

    if (audioTrack !== this._audioTrack) {
      this._setTrack(audioTrack);
    }

    if (this.ref.current) {
      this.ref.current.volume = audioVolume ** 2;
    }
  }

  _setTrack(audioTrack)
  {
    if (this._audioTrack === audioTrack)
      return;

    this._audioTrack = audioTrack;

    if (this.ref.current) {
      if (audioTrack)
      {
        const stream = new MediaStream();

        if (audioTrack) {
          stream.addTrack(audioTrack);
        }

        this.ref.current.srcObject = stream;
        this.ref.current.volume = this.props.audioVolume;
      }
      else
      {
        this.ref.current.srcObject = null;
      }
    }
  }
}

PeerAudio.propTypes =
{
audioTrack : PropTypes.any,
             audioVolume: PropTypes.number
};
