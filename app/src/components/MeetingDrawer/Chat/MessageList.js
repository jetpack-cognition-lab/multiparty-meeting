import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import { FormattedTime } from 'react-intl';
import Message from './Message';
import EmptyAvatar from '../../../images/avatar-empty.jpeg';

const styles = (theme) =>
	({
		root :
		{
			height        : '100%',
			display       : 'flex',
			flexDirection : 'column',
			alignItems    : 'center',
			overflowY     : 'auto',
			padding       : theme.spacing(1),	
		}
	});

class MessageList extends React.Component
{
	componentDidMount()
	{
		this.node.scrollTop = this.node.scrollHeight;
	  // this.scrollToBottom();
	}

	getSnapshotBeforeUpdate()
	{
		return this.node.scrollTop
			+ this.node.offsetHeight === this.node.scrollHeight;
	}

	shouldComponentUpdate(nextProps)
	{
		return nextProps.chat.length !== this.props.chat.length
      || nextProps.showPlaylist !== this.props.showPlaylist
	}

	componentDidUpdate(prevProps, prevState, shouldScroll)
	{
		// if (shouldScroll)
		// {
		this.node.scrollTop = this.node.scrollHeight;
		// }
		// this.scrollToBottom();
	}

	getTimeString(time)
	{
		return (<FormattedTime value={new Date(time)} />);
	}

	// scrollToBottom() 
	// {
	//  	this.messagesEnd.scrollIntoView({ behavior: 'smooth' });
	// }

	render()
	{
		const {
			chat,
			myPicture,
			classes,
      showPlaylist
		} = this.props;

    const messages = showPlaylist
      ? chat
      : chat.filter(m => m.name !== 'PlaylistBot' && m.text.slice(0, 4) !== '/plb')
	
		return (
			<div className={classes.root} ref={(node) => { this.node = node; }}>
				{
					messages.map((message, index) =>
					{
						const picture = (message.sender === 'response' ?
							message.picture : myPicture) || EmptyAvatar;

						return (
							<Message
								key={index}
								self={message.sender === 'client'}
								picture={picture}
								text={message.text}
								time={this.getTimeString(message.time)}
								name={message.name}
							/>
						);
					})
				}
			</div>
		);
	}
}

MessageList.propTypes =
{
	chat      : PropTypes.array,
	myPicture : PropTypes.string,
  showPlaylist: PropTypes.bool,
	classes   : PropTypes.object.isRequired
};

const mapStateToProps = (state) =>
	({
		chat      : state.chat,
		myPicture : state.me.picture
	});

export default connect(
	mapStateToProps,
	null,
	null,
	{
		areStatesEqual : (next, prev) =>
		{
			return (
				prev.chat === next.chat &&
				prev.me.picture === next.me.picture
			);
		}
	}
)(withStyles(styles)(MessageList));
