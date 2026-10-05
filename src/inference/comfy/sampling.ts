// THE TWO ENUMS EVERY ComfyUI KSampler TAKES, declared once.
//
// ⚠️ READ OFF `GET /object_info/KSampler` ON A REAL INSTALL, never guessed — the same rule the
// ACE-Step ranges keep next door. A sampler name is compared exactly by the server: one wrong
// string is a 400 at queue time, after the person has already waited for the press.
//
// ⚠️ AND THEY ARE SHARED BY EVERY MEDIUM THAT SAMPLES, which is why they are here and not in a
// medium's table. Video, sound and any picture graph published tomorrow reach the same node.

/** 44 solvers, in the order ComfyUI lists them. */
export const COMFY_SAMPLERS = [
  'euler', 'euler_cfg_pp', 'euler_ancestral', 'euler_ancestral_cfg_pp',
  'heun', 'heunpp2', 'exp_heun_2_x0', 'exp_heun_2_x0_sde',
  'dpm_2', 'dpm_2_ancestral', 'lms', 'dpm_fast',
  'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_2s_ancestral_cfg_pp', 'dpmpp_sde',
  'dpmpp_sde_gpu', 'dpmpp_2m', 'dpmpp_2m_cfg_pp', 'dpmpp_2m_sde',
  'dpmpp_2m_sde_gpu', 'dpmpp_2m_sde_heun', 'dpmpp_2m_sde_heun_gpu', 'dpmpp_3m_sde',
  'dpmpp_3m_sde_gpu', 'ddpm', 'lcm', 'ipndm',
  'ipndm_v', 'deis', 'res_multistep', 'res_multistep_cfg_pp',
  'res_multistep_ancestral', 'res_multistep_ancestral_cfg_pp', 'gradient_estimation', 'gradient_estimation_cfg_pp',
  'er_sde', 'seeds_2', 'seeds_3', 'sa_solver',
  'sa_solver_pece', 'ddim', 'uni_pc', 'uni_pc_bh2',
] as const

/** 9 noise schedules. */
export const COMFY_SCHEDULERS = [
  'simple', 'sgm_uniform', 'karras', 'exponential',
  'ddim_uniform', 'beta', 'normal', 'linear_quadratic',
  'kl_optimal',
] as const
