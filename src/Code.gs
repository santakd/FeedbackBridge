/**
 * ============================================================================
 * GOOGLE FORM TO GITHUB ISSUES INTEGRATION
 * ============================================================================
 * Author: santakd
 * Description:
 *   Listens for Google Form submissions and automatically creates a new 
 *   GitHub Issue in the corresponding repository via the GitHub REST API.
 * 
 * Prerequisites:
 *   1. Store your GitHub Personal Access Token (PAT) with `repo` scope inside:
 *      Project Settings (Gear icon) -> Script Properties -> Add property:
 *      Property: GITHUB_TOKEN
 *      Value:    <your_personal_access_token>
 *   2. Run `createTrigger()` once manually to set up the form submission listener.
 * 
 * NOTE:
 * Duplicate Triggers Check: If you have run createTrigger() more than once in the past, open the
 * Triggers tab (clock icon on the left navigation bar) and delete any extra duplicate triggers.
 */

// ============================================================================
// 1. CONFIGURATION - CHANGE HERE FOR YOUR SETUP
// ============================================================================

// The Google Form ID (found in the form's edit URL: /forms/d/<FORM_ID>/edit)
const FORM_ID = '123456789XYZ'; // Change for your respective form id !!

/**
 * Maps the user-friendly dropdown label from the form to the actual
 * GitHub repository target formatted as "owner/repo-name".
 */
const REPO_MAP = { // Change for your respective repos !!
  'name1': 'owner/repo-name1',
  'name2': 'owner/repo-name2',
  'name3': 'owner/repo-name3'
};

/**
 * Exact question titles from the Google Form.
 * WARNING: If you rename any question in the form, you must update these constants!
 */
const Q_TITLE = 'Issue Title';
const Q_DESCRIPTION = 'Issue Description';
const Q_REPO = 'GitHub Repository';
const Q_LABELS = 'Labels';
const Q_REPORTER = 'Your Name/Email';


// ============================================================================
// 2. SETUP (RUN ONLY ONCE)
// ============================================================================

/**
 * Installs an installable trigger that runs on every form submission.
 * 
 * IMPORTANT:
 * Run this function manually ONLY ONCE from the Apps Script editor.
 * Running it multiple times creates duplicate triggers, resulting in duplicate issues.
 */
function createTrigger() {
  const form = FormApp.openById(FORM_ID);
  
  ScriptApp.newTrigger('onFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();
}


// ============================================================================
// 3. EVENT HANDLERS
// ============================================================================

/**
 * Triggered automatically whenever a user submits the Google Form.
 * Extracts user responses, formats the issue content, and initiates issue creation.
 * 
 * @param {Object} e - The form submit event object supplied by Google Apps Script.
 */
function onFormSubmit(e) {
  try {
    // 1. Convert form responses into a key-value map: { "Question Title": "User Response" }
    const answers = {};
    e.response.getItemResponses().forEach(function (item) {
      answers[item.getItem().getTitle()] = item.getResponse();
    });

    // 2. Resolve the target GitHub repository
    const repoLabel = answers[Q_REPO];
    const repoFullName = REPO_MAP[repoLabel];
    if (!repoFullName) {
      throw new Error('Unknown repository selected: ' + repoLabel);
    }

    // 3. Format the issue Title and Body
    const title = answers[Q_TITLE] || '(no title provided)';
    
    // Append the reporter's contact info as a footer in markdown format
    const reporter = answers[Q_REPORTER] ? '\n\n---\nSubmitted by: ' + answers[Q_REPORTER] : '';
    const body = (answers[Q_DESCRIPTION] || '') + reporter;

    // 4. Handle Labels (Google Forms checkbox items return an array, text/dropdown return a string)
    let labels = [];
    if (answers[Q_LABELS]) {
      labels = Array.isArray(answers[Q_LABELS]) ? answers[Q_LABELS] : [answers[Q_LABELS]];
    }

    // 5. Send data to GitHub API
    createGithubIssue(repoFullName, title, body, labels);

  } catch (err) {
    // Fallback: Send an email alert to the script owner so failed submissions aren't silently lost
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'Form -> GitHub issue creation failed',
      err.message + '\n\n' + err.stack
    );
  }
}


// ============================================================================
// 4. API HELPERS
// ============================================================================

/**
 * Makes an HTTP POST request to the GitHub REST API to create an issue.
 * 
 * @param {string} repoFullName - Format: "owner/repo-name"
 * @param {string} title        - The issue title.
 * @param {string} body         - The markdown body/description of the issue.
 * @param {string[]} labels     - Array of GitHub label names.
 */
function createGithubIssue(repoFullName, title, body, labels) {
  // Retrieve the PAT token securely from Script Properties
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('GITHUB_TOKEN script property is not set. Please add it under Project Settings.');
  }

  // Construct request payload
  const payload = { 
    title: title, 
    body: body 
  };
  
  // Only add the labels key if labels exist
  if (labels.length) {
    payload.labels = labels;
  }

  // Send request to GitHub REST API v3
  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + repoFullName + '/issues', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28' // Pinning GitHub API version for consistency
    },
    payload: JSON.stringify(payload),
    // Allows us to inspect the HTTP status code directly rather than throwing an unhandled exception immediately
    muteHttpExceptions: true
  });

  // GitHub returns HTTP 201 (Created) when an issue is successfully generated
  if (response.getResponseCode() !== 201) {
    throw new Error('GitHub API error (' + response.getResponseCode() + '): ' + response.getContentText());
  }
}
