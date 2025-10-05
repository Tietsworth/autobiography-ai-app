import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Users, Brain, Plus, Search, Filter, Share2, Lock, Globe, Heart, MessageCircle, Camera, Video, FileText, Edit3, Save, X, Eye, EyeOff, MapPin, Clock, Lightbulb, Image, HelpCircle, ChevronRight, ChevronDown, Zap, Archive, Map, Loader2 } from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';

const AutobiographyApp = () => {
  // --- Firebase State and Initialization ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Global variables provided by the Canvas environment
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-autobiography-app';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  useEffect(() => {
    const initFirebase = async () => {
      try {
        if (!Object.keys(firebaseConfig).length) {
          console.error("Firebase config is missing. Please ensure __firebase_config is provided.");
          setError("Firebase configuration is missing. Cannot connect to database.");
          setLoading(false);
          return;
        }

        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestoreDb);
        setAuth(firebaseAuth);

        // Listen for auth state changes
        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          if (user) {
            setUserId(user.uid);
            setIsAuthReady(true);
            console.log("Firebase Auth State Changed: User is signed in.", user.uid);
          } else {
            console.log("Firebase Auth State Changed: No user signed in. Attempting sign-in...");
            try {
              if (initialAuthToken) {
                await signInWithCustomToken(firebaseAuth, initialAuthToken);
                console.log("Signed in with custom token.");
              } else {
                await signInAnonymously(firebaseAuth);
                console.log("Signed in anonymously.");
              }
            } catch (authError) {
              console.error("Firebase authentication error:", authError);
              setError(`Authentication failed: ${authError.message}`);
            }
          }
          setLoading(false); // Auth state is determined, stop loading
        });

        return () => unsubscribe(); // Cleanup auth listener
      } catch (err) {
        console.error("Failed to initialize Firebase:", err);
        setError(`Failed to initialize application: ${err.message}`);
        setLoading(false);
      }
    };

    initFirebase();
  }, [firebaseConfig, initialAuthToken]); // Re-run if config or token changes

  // --- App Data States ---
  const [entries, setEntries] = useState([]);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [photoRequests, setPhotoRequests] = useState([]);
  const [historicalImages, setHistoricalImages] = useState([
    {
      id: 'hi1',
      location: 'University of Florida, Gainesville',
      year: 2024,
      description: 'Graduation ceremony at Ben Hill Griffin Stadium',
      imageUrl: 'https://placehold.co/300x200/E0E7FF/4F46E5?text=UF+Stadium',
      source: 'UF Archives'
    },
    {
      id: 'hi2',
      location: 'Lincoln High School, Orlando',
      year: 2015,
      description: 'Main entrance of Lincoln High School',
      imageUrl: 'https://placehold.co/300x200/F0F9FF/0B69FF?text=Lincoln+High',
      source: 'School District Archives'
    }
  ]); // Historical images can be static or fetched from a public collection

  // --- UI States ---
  const [currentView, setCurrentView] = useState('entries');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [selectedTimelineYear, setSelectedTimelineYear] = useState(null);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null); // State to hold entry being edited
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState('success'); // 'success' or 'error'

  // --- New Entry/Edit Entry Form State ---
  const [formEntry, setFormEntry] = useState({
    title: '',
    content: '',
    date: new Date().toISOString().split('T')[0],
    location: '',
    tags: [],
    privacy: 'private',
    type: 'personal',
    mediaUrls: [], // For image/video uploads
    collaborativeEntries: [] // For collaborative comments
  });

  // --- Feedback Message Handler ---
  const showUserFeedback = useCallback((message, type = 'success') => {
    setFeedbackMessage(message);
    setFeedbackType(type);
    setShowFeedback(true);
    const timer = setTimeout(() => {
      setShowFeedback(false);
      setFeedbackMessage('');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // --- Firestore Data Fetching ---
  useEffect(() => {
    if (!db || !userId || !isAuthReady) return;

    // Function to fetch a collection
    const fetchCollection = (collectionName, setStateFunc) => {
      const colRef = collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStateFunc(data);
        console.log(`Fetched ${collectionName}:`, data);
      }, (err) => {
        console.error(`Error fetching ${collectionName}:`, err);
        showUserFeedback(`Error loading ${collectionName}: ${err.message}`, 'error');
      });
      return unsubscribe;
    };

    // Fetch all relevant collections
    const unsubscribeEntries = fetchCollection('entries', setEntries);
    const unsubscribeTimeline = fetchCollection('timelineEvents', setTimelineEvents);
    const unsubscribeAiQuestions = fetchCollection('aiQuestions', setAiQuestions);
    const unsubscribePhotoRequests = fetchCollection('photoRequests', setPhotoRequests);

    // Cleanup function for all listeners
    return () => {
      unsubscribeEntries();
      unsubscribeTimeline();
      unsubscribeAiQuestions();
      unsubscribePhotoRequests();
    };
  }, [db, userId, isAuthReady, appId, showUserFeedback]);

  // --- CRUD Operations for Entries ---

  // Function to open the new entry modal or edit entry modal
  const openEntryModal = (entryToEdit = null) => {
    if (entryToEdit) {
      setEditingEntry(entryToEdit);
      setFormEntry({
        title: entryToEdit.title,
        content: entryToEdit.content,
        date: entryToEdit.date,
        location: entryToEdit.location,
        tags: entryToEdit.tags || [],
        privacy: entryToEdit.privacy,
        type: entryToEdit.type,
        mediaUrls: entryToEdit.mediaUrls || [],
        collaborativeEntries: entryToEdit.collaborativeEntries || []
      });
    } else {
      setEditingEntry(null);
      setFormEntry({
        title: '',
        content: '',
        date: new Date().toISOString().split('T')[0],
        location: '',
        tags: [],
        privacy: 'private',
        type: 'personal',
        mediaUrls: [],
        collaborativeEntries: []
      });
    }
    setShowNewEntry(true);
  };

  // Function to handle saving a new entry or updating an existing one
  const handleSaveEntry = async () => {
    if (!db || !userId) {
      showUserFeedback("Database not ready. Please try again.", 'error');
      return;
    }
    if (!formEntry.title || !formEntry.content) {
      showUserFeedback("Title and content cannot be empty.", 'error');
      return;
    }

    try {
      const entryData = {
        ...formEntry,
        author: userId, // Store the actual user ID
        authorName: 'You', // Display name
        tags: formEntry.tags.map(tag => tag.trim()).filter(tag => tag !== ''), // Clean up tags
        timestamp: new Date() // Add a timestamp for ordering
      };

      if (editingEntry) {
        // Update existing entry
        const entryRef = doc(db, `artifacts/${appId}/users/${userId}/entries`, editingEntry.id);
        await updateDoc(entryRef, entryData);
        showUserFeedback('Entry updated successfully!');
      } else {
        // Add new entry
        const entriesColRef = collection(db, `artifacts/${appId}/users/${userId}/entries`);
        await addDoc(entriesColRef, entryData);
        showUserFeedback('New entry added successfully!');
      }
      setShowNewEntry(false);
      setEditingEntry(null);
    } catch (err) {
      console.error("Error saving entry:", err);
      showUserFeedback(`Failed to save entry: ${err.message}`, 'error');
    }
  };

  // Function to handle deleting an entry
  const handleDeleteEntry = async (entryId) => {
    if (!db || !userId) {
      showUserFeedback("Database not ready. Please try again.", 'error');
      return;
    }
    if (window.confirm("Are you sure you want to delete this entry? This action cannot be undone.")) {
      try {
        const entryRef = doc(db, `artifacts/${appId}/users/${userId}/entries`, entryId);
        await deleteDoc(entryRef);
        showUserFeedback('Entry deleted successfully!');
      } catch (err) {
        console.error("Error deleting entry:", err);
        showUserFeedback(`Failed to delete entry: ${err.message}`, 'error');
      }
    }
  };

  // --- AI Assistant Functions ---

  // Function to handle answering an AI question
  const handleAnswerAIQuestion = async (questionId, answerContent) => {
    if (!db || !userId) {
      showUserFeedback("Database not ready. Please try again.", 'error');
      return;
    }
    if (!answerContent.trim()) {
      showUserFeedback("Please provide an answer.", 'error');
      return;
    }

    try {
      const questionRef = doc(db, `artifacts/${appId}/users/${userId}/aiQuestions`, questionId);
      await updateDoc(questionRef, {
        answered: true,
        answer: answerContent,
        answeredAt: new Date()
      });
      showUserFeedback('Memory saved to AI Assistant!');
      // Optionally, you could create a new entry from this answer
      // For now, it just marks the question as answered.
    } catch (err) {
      console.error("Error answering AI question:", err);
      showUserFeedback(`Failed to save answer: ${err.message}`, 'error');
    }
  };

  // Function to simulate AI generating a new question based on a timeline year
  const generateAIQuestionsForYear = async (year) => {
    if (!db || !userId) {
      showUserFeedback("Database not ready. Please try again.", 'error');
      return;
    }
    // Simulate AI generating questions
    const newQuestions = [
      {
        id: `q${Date.now()}a`,
        question: `What were your biggest aspirations or dreams during ${year}?`,
        relatedEntry: null,
        type: 'reflection',
        answered: false
      },
      {
        id: `q${Date.now()}b`,
        question: `Who were your closest friends or mentors in ${year} and how did they influence you?`,
        relatedEntry: null,
        type: 'people',
        answered: false
      }
    ];

    try {
      const aiQuestionsColRef = collection(db, `artifacts/${appId}/users/${userId}/aiQuestions`);
      for (const q of newQuestions) {
        await setDoc(doc(aiQuestionsColRef, q.id), q); // Use setDoc with custom ID
      }
      showUserFeedback(`New AI questions generated for ${year}!`);
    } catch (err) {
      console.error("Error generating AI questions:", err);
      showUserFeedback(`Failed to generate AI questions: ${err.message}`, 'error');
    }
  };

  // --- Photo Request Functions ---

  // Function to request historical photos
  const requestHistoricalPhotos = async (location, timeframe, description) => {
    if (!db || !userId) {
      showUserFeedback("Database not ready. Please try again.", 'error');
      return;
    }
    try {
      const photoRequestsColRef = collection(db, `artifacts/${appId}/users/${userId}/photoRequests`);
      await addDoc(photoRequestsColRef, {
        location,
        timeframe,
        description,
        status: 'pending',
        responses: 0,
        requestedAt: new Date()
      });
      showUserFeedback('Photo request submitted successfully!');
    } catch (err) {
      console.error("Error submitting photo request:", err);
      showUserFeedback(`Failed to submit photo request: ${err.message}`, 'error');
    }
  };

  // --- Collaborative Entry Functions (Simulated) ---
  const handleAddCollaborativeComment = async (entryId, authorName, content) => {
    if (!db || !userId) {
      showUserFeedback("Database not ready. Please try again.", 'error');
      return;
    }
    if (!content.trim()) {
      showUserFeedback("Comment cannot be empty.", 'error');
      return;
    }

    try {
      const entryRef = doc(db, `artifacts/${appId}/users/${userId}/entries`, entryId);
      const entryDoc = await getDoc(entryRef);
      if (entryDoc.exists()) {
        const currentCollaborativeEntries = entryDoc.data().collaborativeEntries || [];
        const newCollaborativeEntry = {
          id: `c${Date.now()}`,
          author: authorName,
          content: content,
          likes: 0,
          timestamp: new Date()
        };
        await updateDoc(entryRef, {
          collaborativeEntries: [...currentCollaborativeEntries, newCollaborativeEntry]
        });
        showUserFeedback('Collaborative comment added!');
      }
    } catch (err) {
      console.error("Error adding collaborative comment:", err);
      showUserFeedback(`Failed to add comment: ${err.message}`, 'error');
    }
  };

  const handleLikeCollaborativeComment = async (entryId, commentId) => {
    if (!db || !userId) {
      showUserFeedback("Database not ready. Please try again.", 'error');
      return;
    }
    try {
      const entryRef = doc(db, `artifacts/${appId}/users/${userId}/entries`, entryId);
      const entryDoc = await getDoc(entryRef);
      if (entryDoc.exists()) {
        const currentCollaborativeEntries = entryDoc.data().collaborativeEntries || [];
        const updatedCollaborativeEntries = currentCollaborativeEntries.map(comment =>
          comment.id === commentId ? { ...comment, likes: (comment.likes || 0) + 1 } : comment
        );
        await updateDoc(entryRef, { collaborativeEntries: updatedCollaborativeEntries });
        showUserFeedback('Comment liked!');
      }
    } catch (err) {
      console.error("Error liking comment:", err);
      showUserFeedback(`Failed to like comment: ${err.message}`, 'error');
    }
  };

  // --- Filtering and Sorting ---
  const filteredEntries = entries
    .filter(entry => {
      const matchesSearch = entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (entry.tags && entry.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))) ||
                           entry.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterBy === 'all' || entry.type === filterBy;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending

  // --- Render Logic ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
        <p className="ml-4 text-lg text-gray-700">Loading your story, Mike...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 text-red-800 p-6 rounded-lg m-4">
        <X className="w-12 h-12 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Error Loading Application</h2>
        <p className="text-center">{error}</p>
        <p className="mt-4 text-sm text-red-600">Please ensure your Firebase configuration is correct and try again.</p>
      </div>
    );
  }

  const getPrivacyIcon = (privacy) => {
    switch(privacy) {
      case 'private': return <Lock className="w-4 h-4" />;
      case 'friends': return <Users className="w-4 h-4" />;
      case 'public': return <Globe className="w-4 h-4" />;
      default: return <Lock className="w-4 h-4" />;
    }
  };

  const getPrivacyColor = (privacy) => {
    switch(privacy) {
      case 'private': return 'text-red-500';
      case 'friends': return 'text-yellow-500';
      case 'public': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 font-sans text-gray-800">
      {/* Feedback Message */}
      {showFeedback && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-transform transform ${
          feedbackType === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        } translate-x-0 opacity-100`}>
          {feedbackMessage}
        </div>
      )}

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-8 h-8 text-purple-600" />
                <h1 className="text-2xl font-bold">My Living Story</h1>
              </div>
              <div className="hidden md:flex space-x-4">
                <button
                  onClick={() => setCurrentView('entries')}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                    currentView === 'entries' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <FileText className="w-4 h-4" /> <span>My Entries</span>
                </button>
                <button
                  onClick={() => setCurrentView('timeline')}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                    currentView === 'timeline' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Clock className="w-4 h-4" /> <span>Life Timeline</span>
                </button>
                <button
                  onClick={() => setCurrentView('ai-assistant')}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                    currentView === 'ai-assistant' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Brain className="w-4 h-4" /> <span>AI Memory Helper</span>
                </button>
                <button
                  onClick={() => setCurrentView('photo-requests')}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                    currentView === 'photo-requests' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Camera className="w-4 h-4" /> <span>Photo Requests</span>
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {userId && (
                <div className="text-sm text-gray-600 flex items-center space-x-1">
                  <Users className="w-4 h-4 text-gray-500" />
                  <span>User ID: <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{userId}</span></span>
                </div>
              )}
              <button
                onClick={() => openEntryModal()}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>New Entry</span>
              </button>
            </div>
          </div>
          {/* Mobile Navigation */}
          <div className="md:hidden mt-4 flex justify-center space-x-2 overflow-x-auto pb-2">
            <button
              onClick={() => setCurrentView('entries')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                currentView === 'entries' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Entries
            </button>
            <button
              onClick={() => setCurrentView('timeline')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                currentView === 'timeline' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setCurrentView('ai-assistant')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                currentView === 'ai-assistant' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              AI Helper
            </button>
            <button
              onClick={() => setCurrentView('photo-requests')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                currentView === 'photo-requests' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Photos
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* New Entry/Edit Entry Modal */}
        {showNewEntry && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg relative">
              <button
                onClick={() => setShowNewEntry(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center space-x-2">
                {editingEntry ? <Edit3 className="w-6 h-6 text-purple-600" /> : <Plus className="w-6 h-6 text-purple-600" />}
                <span>{editingEntry ? 'Edit Entry' : 'Create New Entry'}</span>
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="entryTitle" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    id="entryTitle"
                    value={formEntry.title}
                    onChange={(e) => setFormEntry({ ...formEntry, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., My First Job Interview"
                  />
                </div>
                <div>
                  <label htmlFor="entryContent" className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                  <textarea
                    id="entryContent"
                    value={formEntry.content}
                    onChange={(e) => setFormEntry({ ...formEntry, content: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent h-32 resize-y"
                    placeholder="Write about your memory here..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="entryDate" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      id="entryDate"
                      value={formEntry.date}
                      onChange={(e) => setFormEntry({ ...formEntry, date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="entryLocation" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      id="entryLocation"
                      value={formEntry.location}
                      onChange={(e) => setFormEntry({ ...formEntry, location: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="e.g., New York City"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="entryTags" className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    id="entryTags"
                    value={formEntry.tags.join(', ')}
                    onChange={(e) => setFormEntry({ ...formEntry, tags: e.target.value.split(',') })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., travel, adventure, friends"
                  />
                </div>
                <div>
                  <label htmlFor="entryPrivacy" className="block text-sm font-medium text-gray-700 mb-1">Privacy</label>
                  <select
                    id="entryPrivacy"
                    value={formEntry.privacy}
                    onChange={(e) => setFormEntry({ ...formEntry, privacy: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                  >
                    <option value="private">Private (Only you)</option>
                    <option value="friends">Friends (Selected friends)</option>
                    <option value="public">Public (Anyone can see)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="entryType" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    id="entryType"
                    value={formEntry.type}
                    onChange={(e) => setFormEntry({ ...formEntry, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                  >
                    <option value="personal">Personal Memory</option>
                    <option value="event">Event</option>
                    <option value="reflection">Reflection</option>
                  </select>
                </div>
                {/* Media Upload Placeholder */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Media (Images/Videos)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formEntry.mediaUrls.map((url, index) => (
                      <div key={index} className="relative group">
                        <img src={url} alt="Uploaded media" className="w-20 h-20 object-cover rounded-lg" />
                        <button
                          onClick={() => setFormEntry({ ...formEntry, mediaUrls: formEntry.mediaUrls.filter((_, i) => i !== index) })}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1 -mt-2 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      // In a real app, this would open a file picker and upload to storage (e.g., Firebase Storage)
                      // For now, let's add a placeholder image
                      const newMediaUrl = `https://placehold.co/100x100/A78BFA/FFFFFF?text=Media${formEntry.mediaUrls.length + 1}`;
                      setFormEntry({ ...formEntry, mediaUrls: [...formEntry.mediaUrls, newMediaUrl] });
                      showUserFeedback("Media upload simulated! (Requires actual storage)", "info");
                    }}
                    className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-purple-500 hover:text-purple-600 transition-colors flex items-center justify-center space-x-2"
                  >
                    <Image className="w-5 h-5" />
                    <span>Add Photo/Video</span>
                  </button>
                </div>
                <button
                  onClick={handleSaveEntry}
                  className="w-full px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2 shadow-md"
                >
                  <Save className="w-5 h-5" />
                  <span>{editingEntry ? 'Update Entry' : 'Save Entry'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* My Entries View */}
        {currentView === 'entries' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center space-x-2">
                <FileText className="w-6 h-6 text-purple-600" />
                <span>Your Autobiography Entries</span>
              </h2>
              <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 mb-6">
                <div className="relative w-full sm:w-1/2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search entries by title, content, tags, or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div className="relative w-full sm:w-auto">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <select
                    value={filterBy}
                    onChange={(e) => setFilterBy(e.target.value)}
                    className="w-full sm:w-auto pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none bg-white"
                  >
                    <option value="all">All Types</option>
                    <option value="personal">Personal Memory</option>
                    <option value="event">Event</option>
                    <option value="reflection">Reflection</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none w-4 h-4" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEntries.length > 0 ? (
                  filteredEntries.map(entry => (
                    <div key={entry.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xl font-semibold text-gray-800 truncate">{entry.title}</h3>
                        <div className={`flex items-center space-x-1 text-sm ${getPrivacyColor(entry.privacy)}`}>
                          {getPrivacyIcon(entry.privacy)}
                          <span className="capitalize">{entry.privacy}</span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-2 flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{entry.date}</span>
                      </p>
                      {entry.location && (
                        <p className="text-sm text-gray-600 mb-3 flex items-center space-x-1">
                          <MapPin className="w-4 h-4" />
                          <span>{entry.location}</span>
                        </p>
                      )}
                      {entry.mediaUrls && entry.mediaUrls.length > 0 && (
                        <div className="mb-3">
                          <img src={entry.mediaUrls[0]} alt="Entry media" className="w-full h-40 object-cover rounded-lg" />
                          {entry.mediaUrls.length > 1 && (
                            <p className="text-xs text-gray-500 mt-1">+{entry.mediaUrls.length - 1} more media</p>
                          )}
                        </div>
                      )}
                      <p className="text-gray-700 text-base mb-4 line-clamp-3">{entry.content}</p>
                      
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {entry.tags.map((tag, index) => (
                            <span key={index} className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {entry.aiSuggestions && entry.aiSuggestions.length > 0 && (
                        <div className="bg-blue-50 p-3 rounded-lg mb-4">
                          <div className="flex items-center space-x-2 text-blue-800 mb-2">
                            <Lightbulb className="w-4 h-4" />
                            <span className="font-medium">AI Memory Prompts:</span>
                          </div>
                          <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                            {entry.aiSuggestions.map((suggestion, index) => (
                              <li key={index}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {entry.collaborativeEntries && entry.collaborativeEntries.length > 0 && (
                        <div className="bg-green-50 p-3 rounded-lg mb-4">
                          <div className="flex items-center space-x-2 text-green-800 mb-2">
                            <Users className="w-4 h-4" />
                            <span className="font-medium">Collaborative Memories:</span>
                          </div>
                          <div className="space-y-2">
                            {entry.collaborativeEntries.map(collab => (
                              <div key={collab.id} className="text-sm text-green-700 flex justify-between items-center">
                                <div>
                                  <strong>{collab.author}:</strong> {collab.content}
                                </div>
                                <button
                                  onClick={() => handleLikeCollaborativeComment(entry.id, collab.id)}
                                  className="flex items-center text-gray-500 hover:text-red-500 transition-colors text-xs ml-2"
                                >
                                  <Heart className="w-3 h-3 mr-1" fill={collab.likes > 0 ? 'currentColor' : 'none'} /> {collab.likes}
                                </button>
                              </div>
                            ))}
                          </div>
                          {/* Add new collaborative comment form */}
                          <div className="mt-3 pt-3 border-t border-green-100">
                            <input
                              type="text"
                              placeholder="Add a comment..."
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                  handleAddCollaborativeComment(entry.id, 'Guest User', e.currentTarget.value);
                                  e.currentTarget.value = '';
                                }
                              }}
                            />
                            <p className="text-xs text-gray-500 mt-1">Press Enter to add comment (simulated as "Guest User")</p>
                          </div>
                        </div>
                      )}

                      <div className="mt-auto flex justify-end space-x-2 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => openEntryModal(entry)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm flex items-center space-x-1"
                        >
                          <Edit3 className="w-4 h-4" /> <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-sm flex items-center space-x-1"
                        >
                          <X className="w-4 h-4" /> <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-10 text-gray-500">
                    <p className="text-lg mb-2">No entries found.</p>
                    <p>Try adjusting your search or filters, or create a <button onClick={() => openEntryModal()} className="text-purple-600 hover:underline">new entry</button>!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Life Timeline View */}
        {currentView === 'timeline' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center space-x-2">
                <Clock className="w-6 h-6 text-purple-600" />
                <span>Your Life Timeline</span>
              </h2>
              
              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-300"></div>
                {timelineEvents.length > 0 ? (
                  timelineEvents.sort((a, b) => b.year - a.year).map((timelineEvent) => (
                    <div key={timelineEvent.id} className="relative flex items-center mb-8">
                      <div className={`w-12 h-12 rounded-full ${timelineEvent.color || 'bg-gray-500'} flex items-center justify-center text-white font-bold text-sm relative z-10`}>
                        {timelineEvent.year}
                      </div>
                      <div className="ml-6 flex-1">
                        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                          <h3 className="font-semibold text-gray-800 mb-2">{timelineEvent.year}</h3>
                          <div className="space-y-2">
                            {timelineEvent.events && timelineEvent.events.length > 0 ? (
                              timelineEvent.events.map((event, eventIndex) => (
                                <div key={eventIndex} className="flex items-center justify-between">
                                  <span className="text-gray-700">{event}</span>
                                  <button
                                    onClick={() => {
                                      setSelectedTimelineYear(timelineEvent.year);
                                      generateAIQuestionsForYear(timelineEvent.year); // Generate new questions
                                    }}
                                    className="text-purple-600 hover:text-purple-800 text-sm flex items-center space-x-1"
                                  >
                                    <Lightbulb className="w-4 h-4" />
                                    <span>Remember more</span>
                                  </button>
                                </div>
                              ))
                            ) : (
                              <p className="text-gray-500 text-sm">No specific events recorded for this year.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    <p className="text-lg mb-2">No timeline events found.</p>
                    <p>Add entries to automatically build your timeline!</p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Timeline Questions */}
            {selectedTimelineYear && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                  <Brain className="w-5 h-5 text-blue-500" />
                  <span>Let's Remember More About {selectedTimelineYear}</span>
                </h3>
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-blue-800 mb-3">
                      <strong>AI:</strong> I see you have some memories from {selectedTimelineYear}. Here are some questions to help you remember more details:
                    </p>
                    <div className="space-y-2">
                      {/* These are static prompts, but `generateAIQuestionsForYear` above adds dynamic ones to aiQuestions state */}
                      <button className="block w-full text-left px-4 py-2 bg-white rounded-lg hover:bg-blue-50 transition-colors">
                        "What was your daily routine like during {selectedTimelineYear}?"
                      </button>
                      <button className="block w-full text-left px-4 py-2 bg-white rounded-lg hover:bg-blue-50 transition-colors">
                        "Who were the most important people in your life then?"
                      </button>
                      <button className="block w-full text-left px-4 py-2 bg-white rounded-lg hover:bg-blue-50 transition-colors">
                        "What challenges were you facing during this time?"
                      </button>
                      <button className="block w-full text-left px-4 py-2 bg-white rounded-lg hover:bg-blue-50 transition-colors">
                        "What were you most excited about in {selectedTimelineYear}?"
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Assistant View */}
        {currentView === 'ai-assistant' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center space-x-2">
                <Brain className="w-6 h-6 text-blue-600" />
                <span>AI Memory Assistant</span>
              </h2>
              
              <div className="space-y-4">
                {aiQuestions.length > 0 ? (
                  aiQuestions.map((question) => (
                    <div key={question.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <Brain className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-sm font-medium text-blue-600">
                              {question.type === 'followup' ? 'Follow-up Question' : 
                               question.type === 'detail' ? 'Detail Question' : 
                               question.type === 'gap' ? 'Timeline Gap' : 'AI Prompt'}
                            </span>
                          </div>
                          <p className="text-gray-800 mb-3">{question.question}</p>
                          
                          {!question.answered ? (
                            <div className="space-y-2">
                              <textarea
                                placeholder="Share your memory here..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none"
                                id={`ai-answer-${question.id}`} // Unique ID for textarea
                              />
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleAnswerAIQuestion(question.id, document.getElementById(`ai-answer-${question.id}`).value)}
                                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md"
                                >
                                  Save Memory
                                </button>
                                <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                                  Skip for now
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-green-50 p-3 rounded-lg">
                              <p className="text-green-800 text-sm">✓ Memory saved! This will be added to your timeline.</p>
                              <p className="text-green-700 text-xs mt-1">Your Answer: "{question.answer}"</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    <p className="text-lg mb-2">No AI memory prompts right now.</p>
                    <p>The AI will suggest questions as you add more entries and build your timeline!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Historical Context */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                <Archive className="w-5 h-5 text-purple-600" />
                <span>Historical Context</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {historicalImages.map((image) => (
                  <div key={image.id} className="border border-gray-200 rounded-xl p-4">
                    <img src={image.imageUrl} alt={image.description} className="w-full h-40 object-cover rounded-lg mb-3" />
                    <h4 className="font-medium text-gray-800">{image.location}</h4>
                    <p className="text-sm text-gray-600">{image.description}</p>
                    <p className="text-xs text-gray-500 mt-1">Source: {image.source}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 bg-purple-50 rounded-lg text-purple-800">
                <p className="font-semibold mb-2">Future AI Capabilities:</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>**Dynamic Prompt Generation:** AI could generate questions based on your specific entry content and historical data.</li>
                  <li>**Story Weaving:** AI could help you combine multiple entries into a cohesive narrative or summarize periods of your life.</li>
                  <li>**Sentiment Analysis:** AI could analyze the emotional tone of your entries, providing insights into your feelings over time.</li>
                  <li>**Image Generation:** AI could suggest and generate images based on your written memories to visualize your story.</li>
                </ul>
                <p className="text-xs mt-2">These features would typically require integration with a powerful language model API (like Gemini) and potentially image generation APIs.</p>
              </div>
            </div>
          </div>
        )}

        {/* Photo Requests View */}
        {currentView === 'photo-requests' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center space-x-2">
                <Camera className="w-6 h-6 text-green-600" />
                <span>Community Photo Requests</span>
              </h2>
              
              <div className="bg-blue-50 p-4 rounded-lg mb-6">
                <p className="text-blue-800">
                  <strong>How it works:</strong> When you mention places or events, we can ask the community if anyone has photos from those times and places. This helps bring your memories to life with visual context!
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  <span className="font-semibold">Note:</span> In a full application, this would involve a community feature where other users could upload photos in response to your requests. For this demo, requests are saved, but responses are simulated.
                </p>
              </div>

              <div className="space-y-4">
                {photoRequests.length > 0 ? (
                  photoRequests.map((request) => (
                    <div key={request.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
                        <div className="flex-1 mb-3 sm:mb-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span className="font-medium text-gray-800">{request.location}</span>
                            <span className="text-sm text-gray-500">• {request.timeframe}</span>
                          </div>
                          <p className="text-gray-700 mb-3">{request.description}</p>
                          <div className="flex items-center space-x-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {request.status === 'pending' ? 'Pending' : 'Found'}
                            </span>
                            {request.responses > 0 && (
                              <span className="text-sm text-gray-600 flex items-center space-x-1">
                                <MessageCircle className="w-4 h-4" />
                                <span>{request.responses} Responses</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2 mt-3 sm:mt-0">
                          {request.status === 'found' && (
                            <button className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm flex items-center space-x-1 shadow-md">
                              <Eye className="w-4 h-4" /> <span>View Responses</span>
                            </button>
                          )}
                          {request.status === 'pending' && (
                            <button
                              onClick={() => {
                                // Simulate response for demo purposes
                                const updatedPhotoRequests = photoRequests.map(pr =>
                                  pr.id === request.id ? { ...pr, status: 'found', responses: pr.responses + 1 } : pr
                                );
                                setPhotoRequests(updatedPhotoRequests);
                                showUserFeedback("Simulated a response to your photo request!");
                                // In a real app, this would be a delete request to Firestore
                                // handleDeletePhotoRequest(request.id);
                              }}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm flex items-center space-x-1"
                            >
                              <Zap className="w-4 h-4" /> <span>Simulate Response</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    <p className="text-lg mb-2">No photo requests submitted yet.</p>
                    <p>Request photos from your past to enrich your memories!</p>
                  </div>
                )}

                <button
                  onClick={() => requestHistoricalPhotos(prompt("Enter location for photo request:"), prompt("Enter timeframe (e.g., 2010s):"), prompt("Enter a brief description:"))}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-purple-500 hover:text-purple-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <Plus className="w-5 h-5" />
                  <span>Request New Photos</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutobiographyApp
