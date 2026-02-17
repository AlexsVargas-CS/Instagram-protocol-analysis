package main

import (
	"fmt"
	"os"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	m := InitialModel()

	m.threads = dummyThreads()
	m.conversationCache = dummyConversations()
	m.connected = true
	m.username = "your_username"

	// Alt-screen gives us the full terminal and restores it on exit.
	p := tea.NewProgram(m, tea.WithAltScreen())

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running program: %v\n", err)
		os.Exit(1)
	}
}

func dummyThreads() []Thread {
	now := time.Now()

	return []Thread{
		{
			ThreadID: "thread_001",
			Users: []User{
				{PK: "1001", Username: "alice_dev"},
			},
			LastMessage: Message{
				Text:      "Hey, did you finish the PR?",
				Timestamp: now.Add(-15 * time.Minute).UnixMicro(),
				UserId:    "1001",
			},
			UnreadCount:    2,
			LastActivityAt: now.Add(-15 * time.Minute).UnixMicro(),
			IsGroup:        false,
		},
		{
			ThreadID: "thread_002",
			Users: []User{
				{PK: "1002", Username: "bob_photos"},
			},
			LastMessage: Message{
				Text:      "Check out this sunset I captured yesterday, it was absolutely incredible and the colors were unreal",
				Timestamp: now.Add(-2 * time.Hour).UnixMicro(),
				UserId:    "1002",
			},
			UnreadCount:    27,
			LastActivityAt: now.Add(-2 * time.Hour).UnixMicro(),
			IsGroup:        false,
		},
		{
			ThreadID: "thread_003",
			Users: []User{
				{PK: "1003", Username: "carol_music"},
			},
			LastMessage: Message{
				Text:      "Thanks!",
				Timestamp: now.Add(-5 * time.Hour).UnixMicro(),
				UserId:    "me",
			},
			UnreadCount:    0,
			LastActivityAt: now.Add(-5 * time.Hour).UnixMicro(),
			IsGroup:        false,
		},
		{
			ThreadID: "thread_004",
			Users: []User{
				{PK: "1004", Username: "dave_sec"},
				{PK: "1005", Username: "eve_hack"},
				{PK: "1006", Username: "frank_ops"},
			},
			LastMessage: Message{
				Text:      "Meeting at 3pm tomorrow",
				Timestamp: now.AddDate(0, 0, -1).UnixMicro(),
				UserId:    "1004",
			},
			UnreadCount:    3,
			LastActivityAt: now.AddDate(0, 0, -1).UnixMicro(),
			IsGroup:        true,
		},
		{
			ThreadID: "thread_005",
			Users: []User{
				{PK: "1007", Username: "grace_design"},
			},
			LastMessage: Message{
				Text:      "Can you review the mockups?",
				Timestamp: now.AddDate(0, 0, -3).UnixMicro(),
				UserId:    "1007",
			},
			UnreadCount:    1,
			LastActivityAt: now.AddDate(0, 0, -3).UnixMicro(),
			IsGroup:        false,
		},
		{
			ThreadID: "thread_006",
			Users: []User{
				{PK: "1008", Username: "heidi_code"},
			},
			LastMessage: Message{
				Text:      "lgtm",
				Timestamp: now.AddDate(0, 0, -7).UnixMicro(),
				UserId:    "me",
			},
			UnreadCount:    0,
			LastActivityAt: now.AddDate(0, 0, -7).UnixMicro(),
			IsGroup:        false,
		},
	}
}

// ---------------------------------------------------------------------------
// dummyConversations returns hardcoded message histories for each dummy thread.
//
// Keyed by thread ID so loadConversation() can look them up from the cache.
// Each conversation has 3-5 messages with realistic back-and-forth dialogue.
// "me" is the current user; other userIds match the thread's Users.
// ---------------------------------------------------------------------------

func dummyConversations() map[string][]Message {
	now := time.Now()

	return map[string][]Message{
		"thread_001": {
			{Text: "Hey, I pushed the new auth module", Timestamp: now.Add(-2 * time.Hour).UnixMicro(), UserId: "me"},
			{Text: "Nice, I'll take a look", Timestamp: now.Add(-1 * time.Hour).UnixMicro(), UserId: "1001"},
			{Text: "Found a couple edge cases in the error handling", Timestamp: now.Add(-45 * time.Minute).UnixMicro(), UserId: "1001"},
			{Text: "Oh which ones?", Timestamp: now.Add(-30 * time.Minute).UnixMicro(), UserId: "me"},
			{Text: "Hey, did you finish the PR?", Timestamp: now.Add(-15 * time.Minute).UnixMicro(), UserId: "1001"},
		},
		"thread_002": {
			{Text: "Went hiking at sunset yesterday", Timestamp: now.Add(-5 * time.Hour).UnixMicro(), UserId: "1002"},
			{Text: "That sounds awesome", Timestamp: now.Add(-4 * time.Hour).UnixMicro(), UserId: "me"},
			{Text: "Check out this sunset I captured yesterday, it was absolutely incredible and the colors were unreal", Timestamp: now.Add(-2 * time.Hour).UnixMicro(), UserId: "1002"},
		},
		"thread_003": {
			{Text: "Can you send me that playlist?", Timestamp: now.Add(-8 * time.Hour).UnixMicro(), UserId: "me"},
			{Text: "Sure! Here's the link", Timestamp: now.Add(-7 * time.Hour).UnixMicro(), UserId: "1003"},
			{Text: "It's mostly indie and lo-fi stuff", Timestamp: now.Add(-7 * time.Hour).UnixMicro(), UserId: "1003"},
			{Text: "Thanks!", Timestamp: now.Add(-5 * time.Hour).UnixMicro(), UserId: "me"},
		},
		"thread_004": {
			{Text: "We need to discuss the new firewall rules", Timestamp: now.AddDate(0, 0, -1).Add(-3 * time.Hour).UnixMicro(), UserId: "1005"},
			{Text: "Agreed, the current config is too permissive", Timestamp: now.AddDate(0, 0, -1).Add(-2 * time.Hour).UnixMicro(), UserId: "1006"},
			{Text: "I can draft something by EOD", Timestamp: now.AddDate(0, 0, -1).Add(-1 * time.Hour).UnixMicro(), UserId: "me"},
			{Text: "Meeting at 3pm tomorrow", Timestamp: now.AddDate(0, 0, -1).UnixMicro(), UserId: "1004"},
		},
		"thread_005": {
			{Text: "I updated the figma file with the new components", Timestamp: now.AddDate(0, 0, -4).UnixMicro(), UserId: "1007"},
			{Text: "Looks great, love the color palette", Timestamp: now.AddDate(0, 0, -3).Add(-5 * time.Hour).UnixMicro(), UserId: "me"},
			{Text: "Can you review the mockups?", Timestamp: now.AddDate(0, 0, -3).UnixMicro(), UserId: "1007"},
		},
		"thread_006": {
			{Text: "PR #42 is ready for review", Timestamp: now.AddDate(0, 0, -7).Add(-2 * time.Hour).UnixMicro(), UserId: "1008"},
			{Text: "Looking at it now", Timestamp: now.AddDate(0, 0, -7).Add(-1 * time.Hour).UnixMicro(), UserId: "me"},
			{Text: "lgtm", Timestamp: now.AddDate(0, 0, -7).UnixMicro(), UserId: "me"},
		},
	}
}