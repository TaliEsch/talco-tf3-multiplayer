#pragma once

namespace tf3boundary {
// Offline build-40408 PE/OS-unwinder check only. Never loads executable code or
// registers function tables. Success does not admit hooks, owner parking,
// mitigation changes, full XSTATE preservation, or live game semantics.
bool Qualify40408CommonExitUnwind(const wchar_t* imagePath) noexcept;
}
