/**
 * TaskFlow Pro - Main Application Logic
 */

// ==========================================
// STATE MANAGEMENT
// ==========================================
let tasks = [];
try {
    const saved = localStorage.getItem('taskflow_tasks');
    if (saved) tasks = JSON.parse(saved);
} catch (e) {
    console.error("Failed to parse local storage", e);
}

let currentCategory = 'All';
let currentFilter = 'all'; // 'all', 'pending', 'completed', 'today', 'upcoming', 'high-priority'
let searchQuery = '';
let sortableInstance = null;

// ==========================================
// DOM ELEMENTS (with safety checks)
// ==========================================
const getEl = (id) => document.getElementById(id) || { style: {}, classList: { add:()=>{}, remove:()=>{} }, textContent: '', value: '', addEventListener: ()=>{} };

const taskListEl = document.getElementById('taskList');
const emptyStateEl = document.getElementById('emptyState');
const skeletonLoader = document.getElementById('skeletonLoader');
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const searchInput = document.getElementById('searchInput');
const toastContainer = document.getElementById('toastContainer');

const totalTasksCount = document.getElementById('totalTasksCount');
const completedTasksCount = document.getElementById('completedTasksCount');
const pendingTasksCount = document.getElementById('pendingTasksCount');
const productivityPercent = document.getElementById('productivityPercent');
const productivityBar = document.getElementById('productivityBar');
const productivityBarGlow = document.getElementById('productivityBarGlow');

const currentDateDisplay = document.getElementById('currentDateDisplay');
const greetingMessage = document.getElementById('greetingMessage');

// ==========================================
// SAFE ICON RENDERER
// ==========================================
function refreshIcons() {
    try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (error) {
        console.warn("Lucide icons failed to load:", error);
    }
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    try {
        refreshIcons();
        updateHeaderDate();
        initTheme();
        renderTasksWithLoading();
        updateStats();
        setupEventListeners();
        initSortable();
        
        setInterval(renderTasks, 60000);
    } catch (error) {
        console.error("Initialization Error:", error);
        // Fallback: force modal open event listener in case of crash
        const fab = document.getElementById('fabAddTask');
        if (fab) {
            fab.onclick = () => openModal();
        }
    }
});

// ==========================================
// THEME & HEADER LOGIC
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('taskflow_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const themeBtn = document.getElementById('themeToggle');
    if(themeBtn) {
        updateThemeIcon(savedTheme, themeBtn);
        themeBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('taskflow_theme', newTheme);
            updateThemeIcon(newTheme, themeBtn);
        });
    }
}

function updateThemeIcon(theme, btn) {
    const icon = btn.querySelector('i');
    const text = btn.querySelector('span');
    if(icon && text) {
        if (theme === 'light') {
            icon.setAttribute('data-lucide', 'moon');
            text.textContent = 'Dark Mode';
        } else {
            icon.setAttribute('data-lucide', 'sun');
            text.textContent = 'Light Mode';
        }
        refreshIcons();
    }
}

function updateHeaderDate() {
    if(!currentDateDisplay || !greetingMessage) return;
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    currentDateDisplay.textContent = now.toLocaleDateString('en-US', options);

    const hour = now.getHours();
    let greeting = 'Good Evening';
    if (hour >= 5 && hour < 12) greeting = 'Good Morning';
    else if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
    
    greetingMessage.textContent = `${greeting}, Varun!`;
}

// ==========================================
// TASK OPERATIONS
// ==========================================
function saveTasks() {
    try {
        localStorage.setItem('taskflow_tasks', JSON.stringify(tasks));
    } catch(e) {
        console.error("Could not save tasks", e);
    }
    updateStats();
}

function addTask(taskData) {
    const newTask = {
        id: Date.now().toString(),
        title: taskData.title || 'Untitled Task',
        description: taskData.description || '',
        category: taskData.category || 'Personal',
        priority: taskData.priority || 'medium',
        date: taskData.date || '',
        time: taskData.time || '',
        completed: false,
        createdAt: new Date().toISOString()
    };
    tasks.unshift(newTask);
    saveTasks();
    renderTasksWithLoading();
    showToast('Task added successfully!', 'success');
}

function updateTask(id, taskData) {
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex !== -1) {
        tasks[taskIndex] = { ...tasks[taskIndex], ...taskData };
        saveTasks();
        renderTasks();
        showToast('Task updated!', 'info');
    }
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderTasks();
    showToast('Task deleted', 'error');
}

function toggleTaskComplete(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
        
        if (task.completed) {
            showToast('Task completed!', 'success');
            checkAllCompleted();
        }
    }
}

function checkAllCompleted() {
    if (tasks.length > 0 && tasks.every(t => t.completed)) {
        triggerConfetti();
        showToast('Amazing! All tasks completed! 🎉', 'success', 5000);
    }
}

// ==========================================
// RENDERING & FILTERING
// ==========================================
function getFilteredTasks() {
    let filtered = tasks;

    if (searchQuery) {
        filtered = filtered.filter(t => 
            (t.title && t.title.toLowerCase().includes(searchQuery.toLowerCase())) || 
            (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }

    if (currentCategory !== 'All') {
        filtered = filtered.filter(t => t.category === currentCategory);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    switch (currentFilter) {
        case 'pending': filtered = filtered.filter(t => !t.completed); break;
        case 'completed': filtered = filtered.filter(t => t.completed); break;
        case 'today': filtered = filtered.filter(t => t.date === todayStr); break;
        case 'upcoming': filtered = filtered.filter(t => t.date > todayStr); break;
        case 'high-priority': filtered = filtered.filter(t => t.priority === 'high'); break;
    }
    return filtered;
}

function isTaskOverdue(task) {
    if (!task.date || task.completed) return false;
    const now = new Date();
    let taskDateTimeStr = task.date;
    if (task.time) {
        taskDateTimeStr += `T${task.time}:00`;
    } else {
        taskDateTimeStr += 'T23:59:59';
    }
    return new Date(taskDateTimeStr) < now;
}

function renderTasksWithLoading() {
    if(!taskListEl || !skeletonLoader || !emptyStateEl) return;
    
    taskListEl.innerHTML = '';
    emptyStateEl.classList.remove('active');
    skeletonLoader.style.display = 'flex';
    
    setTimeout(() => {
        skeletonLoader.style.display = 'none';
        renderTasks();
    }, 600);
}

function renderTasks() {
    if(!taskListEl || !emptyStateEl) return;
    
    const filteredTasks = getFilteredTasks();
    taskListEl.innerHTML = '';

    if (filteredTasks.length === 0) {
        emptyStateEl.classList.add('active');
    } else {
        emptyStateEl.classList.remove('active');
        
        filteredTasks.forEach((task, index) => {
            const isOverdue = isTaskOverdue(task);
            const overdueClass = isOverdue ? 'overdue' : '';
            
            const li = document.createElement('li');
            li.className = `task-item priority-${task.priority} ${task.completed ? 'completed' : ''} ${overdueClass}`;
            li.dataset.id = task.id;
            li.style.animationDelay = `${index * 0.05}s`;

            let dateStr = '';
            if (task.date) {
                const dateObj = new Date(task.date);
                if(!isNaN(dateObj)) {
                    dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    if (task.time) dateStr += ` at ${task.time}`;
                }
            }

            li.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete('${task.id}')">
                <div class="task-content">
                    <h4 class="task-title">${task.title}</h4>
                    <div class="task-meta">
                        <span class="badge badge-${task.category}">${task.category}</span>
                        ${dateStr ? `<span class="meta-item ${isOverdue ? 'overdue-text' : ''}"><i data-lucide="${isOverdue ? 'alert-circle' : 'calendar'}"></i> ${dateStr} ${isOverdue ? '(Overdue)' : ''}</span>` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="action-btn edit" onclick="openEditModal('${task.id}')" title="Edit">
                        <i data-lucide="edit-2"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteTask('${task.id}')" title="Delete">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            taskListEl.appendChild(li);
        });
    }
    refreshIcons();
}

function updateStats() {
    if(!totalTasksCount) return;
    
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    let productivity = total > 0 ? Math.round((completed / total) * 100) : 0;

    animateValue(totalTasksCount, parseInt(totalTasksCount.textContent) || 0, total, 500);
    animateValue(completedTasksCount, parseInt(completedTasksCount.textContent) || 0, completed, 500);
    animateValue(pendingTasksCount, parseInt(pendingTasksCount.textContent) || 0, pending, 500);
    
    if(productivityPercent) productivityPercent.textContent = `${productivity}%`;
    if(productivityBar) productivityBar.style.width = `${productivity}%`;
    if(productivityBarGlow) productivityBarGlow.style.width = `${productivity}%`;
}

function animateValue(obj, start, end, duration) {
    if (!obj || isNaN(start) || isNaN(end) || start === end) {
        if(obj) obj.textContent = end;
        return;
    }
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.textContent = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// ==========================================
// DRAG AND DROP LOGIC
// ==========================================
function initSortable() {
    try {
        if (typeof Sortable !== 'undefined' && taskListEl) {
            sortableInstance = new Sortable(taskListEl, {
                animation: 250,
                ghostClass: 'sortable-ghost',
                easing: "cubic-bezier(1, 0, 0, 1)",
                onEnd: function () {
                    const newOrderIds = Array.from(taskListEl.querySelectorAll('.task-item')).map(item => item.dataset.id);
                    if (currentCategory === 'All' && currentFilter === 'all' && !searchQuery) {
                        tasks.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
                        saveTasks();
                    } else {
                        renderTasks();
                        showToast('Disable filters to reorder tasks permanently', 'warning');
                    }
                },
            });
        }
    } catch(e) {
        console.warn("Sortable failed to initialize", e);
    }
}

// ==========================================
// MODAL LOGIC
// ==========================================
function openModal(taskId = null) {
    if(!taskModal || !taskForm) {
        console.error("Modal elements missing!");
        return;
    }
    
    const modalTitle = document.getElementById('modalTitle');
    taskForm.reset();
    document.getElementById('taskId').value = '';

    if (taskId) {
        if(modalTitle) modalTitle.textContent = 'Edit Task';
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            document.getElementById('taskId').value = task.id;
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDesc').value = task.description;
            document.getElementById('taskCategory').value = task.category;
            document.getElementById('taskPriority').value = task.priority;
            document.getElementById('taskDate').value = task.date || '';
            document.getElementById('taskTime').value = task.time || '';
        }
    } else {
        if(modalTitle) modalTitle.textContent = 'Add New Task';
        const catSelect = document.getElementById('taskCategory');
        if(catSelect) catSelect.value = currentCategory === 'All' ? 'Personal' : currentCategory;
    }

    taskModal.classList.add('active');
    setTimeout(() => {
        const titleInput = document.getElementById('taskTitle');
        if(titleInput) titleInput.focus();
    }, 100);
}

function closeModal() {
    if(taskModal) taskModal.classList.remove('active');
}

window.openEditModal = openModal;
window.deleteTask = deleteTask;
window.toggleTaskComplete = toggleTaskComplete;

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
    const fabBtn = document.getElementById('fabAddTask');
    if (fabBtn) fabBtn.addEventListener('click', () => openModal());
    
    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    
    const cancelBtn = document.getElementById('cancelTaskBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (taskModal) {
        taskModal.addEventListener('click', e => {
            if (e.target === taskModal) closeModal();
        });
    }

    if (taskForm) {
        taskForm.addEventListener('submit', e => {
            e.preventDefault();
            const taskId = document.getElementById('taskId').value;
            const taskData = {
                title: document.getElementById('taskTitle').value,
                description: document.getElementById('taskDesc').value,
                category: document.getElementById('taskCategory').value,
                priority: document.getElementById('taskPriority').value,
                date: document.getElementById('taskDate').value,
                time: document.getElementById('taskTime').value,
            };

            if (taskId) updateTask(taskId, taskData);
            else addTask(taskData);
            
            closeModal();
        });
    }

    // Sidebar Category clicks
    document.querySelectorAll('#categoryList .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('#categoryList .nav-item, #filterList .nav-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            
            currentCategory = item.dataset.category;
            currentFilter = 'all';
            
            const catTitle = document.getElementById('currentCategoryTitle');
            if(catTitle) catTitle.textContent = `${currentCategory} Tasks`;
            
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            const allBtn = document.querySelector('.filter-btn[data-status="all"]');
            if(allBtn) allBtn.classList.add('active');

            renderTasksWithLoading();
        });
    });

    // Sidebar Filter clicks
    document.querySelectorAll('#filterList .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('#categoryList .nav-item, #filterList .nav-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            
            currentCategory = 'All';
            currentFilter = item.dataset.filter;
            
            let title = 'Filtered Tasks';
            if(currentFilter === 'today') title = "Today's Tasks";
            if(currentFilter === 'upcoming') title = "Upcoming Tasks";
            if(currentFilter === 'high-priority') title = "High Priority";
            
            const catTitle = document.getElementById('currentCategoryTitle');
            if(catTitle) catTitle.textContent = title;
            renderTasksWithLoading();
        });
    });

    // Top Header Status Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.status;
            renderTasksWithLoading();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderTasks();
        });
    }

    // Mobile Menu
    const sidebar = document.getElementById('sidebar');
    const mobOpen = document.getElementById('mobileMenuOpen');
    const mobClose = document.getElementById('mobileMenuClose');
    
    if (mobOpen && sidebar) mobOpen.addEventListener('click', () => sidebar.classList.add('open'));
    if (mobClose && sidebar) mobClose.addEventListener('click', () => sidebar.classList.remove('open'));
    
    setupPomodoro();
}

// ==========================================
// POMODORO TIMER LOGIC
// ==========================================
let pomodoroTimer = null;
let timeLeft = 25 * 60;
let isRunning = false;

function setupPomodoro() {
    const timeDisplay = document.getElementById('pomodoroTime');
    const startBtn = document.getElementById('pomodoroStart');
    const resetBtn = document.getElementById('pomodoroReset');
    
    if(!timeDisplay || !startBtn || !resetBtn) return;
    
    const icon = startBtn.querySelector('i');

    function updateDisplay() {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function toggleTimer() {
        if (isRunning) {
            clearInterval(pomodoroTimer);
            if(icon) icon.setAttribute('data-lucide', 'play');
        } else {
            pomodoroTimer = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateDisplay();
                } else {
                    clearInterval(pomodoroTimer);
                    showToast('Focus session completed! Great job.', 'success', 5000);
                    triggerConfetti();
                    if(icon) icon.setAttribute('data-lucide', 'play');
                    isRunning = false;
                }
            }, 1000);
            if(icon) icon.setAttribute('data-lucide', 'pause');
        }
        refreshIcons();
        isRunning = !isRunning;
    }

    function resetTimer() {
        clearInterval(pomodoroTimer);
        timeLeft = 25 * 60;
        isRunning = false;
        updateDisplay();
        if(icon) icon.setAttribute('data-lucide', 'play');
        refreshIcons();
    }

    startBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);
    updateDisplay();
}

// ==========================================
// UTILS & EFFECTS
// ==========================================
function showToast(message, type = 'success', duration = 3000) {
    if(!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'trash-2' : type === 'warning' ? 'alert-triangle' : 'info';
    
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    refreshIcons();

    setTimeout(() => toast.classList.add('show'), 50);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

function triggerConfetti() {
    try {
        if (typeof confetti !== 'undefined') {
            const duration = 4000;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 6,
                    angle: 60,
                    spread: 60,
                    origin: { x: 0 },
                    colors: ['#9333ea', '#2563eb', '#0891b2']
                });
                confetti({
                    particleCount: 6,
                    angle: 120,
                    spread: 60,
                    origin: { x: 1 },
                    colors: ['#9333ea', '#2563eb', '#0891b2']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        }
    } catch(e) {
        console.warn("Confetti failed", e);
    }
}
