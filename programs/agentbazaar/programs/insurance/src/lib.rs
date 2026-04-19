use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("HyrtJmJWGAQayoaTWKDsvKxj3jqYYLHGn9LadKCS8Qpi");

pub const TRUSTED_SIGNER: Pubkey =
    anchor_lang::solana_program::pubkey!("33akonyj7usSVXf5nsCZgWANrz3BvVSFBsfR3utoeoLf");

pub const POOL_SEED: &[u8] = b"insurance_pool";
pub const VAULT_SEED: &[u8] = b"insurance_vault";
pub const MAX_TASK_ID_LEN: usize = 32;

#[program]
pub mod insurance {
    use super::*;

    pub fn init_pool(ctx: Context<InitPool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.usdc_mint = ctx.accounts.usdc_mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.total_staked = 0;
        pool.total_released = 0;
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn stake_funds(ctx: Context<StakeFunds>, amount: u64) -> Result<()> {
        require!(amount > 0, InsuranceError::ZeroAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.funder_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;

        let pool = &mut ctx.accounts.pool;
        pool.total_staked = pool.total_staked.saturating_add(amount);
        Ok(())
    }

    pub fn release_to_user(
        ctx: Context<ReleaseToUser>,
        task_id: String,
        amount: u64,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            TRUSTED_SIGNER,
            InsuranceError::Unauthorized
        );
        require!(task_id.len() <= MAX_TASK_ID_LEN, InsuranceError::TaskIdTooLong);
        require!(amount > 0, InsuranceError::ZeroAmount);

        let pool_bump = ctx.accounts.pool.bump;
        let pool_seeds: &[&[u8]] = &[POOL_SEED, &[pool_bump]];
        let signer_seeds = &[pool_seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        let pool = &mut ctx.accounts.pool;
        pool.total_released = pool.total_released.saturating_add(amount);

        emit!(RefundEvent {
            task_id,
            recipient: ctx.accounts.recipient_token_account.owner,
            amount,
        });
        Ok(())
    }
}

#[account]
pub struct InsurancePool {
    pub usdc_mint: Pubkey,      // 32
    pub vault: Pubkey,          // 32
    pub total_staked: u64,      // 8
    pub total_released: u64,    // 8
    pub bump: u8,               // 1
    pub vault_bump: u8,         // 1
}

impl InsurancePool {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(
        init,
        payer = payer,
        space = InsurancePool::SPACE,
        seeds = [POOL_SEED],
        bump
    )]
    pub pool: Account<'info, InsurancePool>,

    #[account(
        init,
        payer = payer,
        seeds = [VAULT_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct StakeFunds<'info> {
    #[account(mut, seeds = [POOL_SEED], bump = pool.bump)]
    pub pool: Account<'info, InsurancePool>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = pool.vault_bump,
        constraint = vault.key() == pool.vault @ InsuranceError::VaultMismatch
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = funder_token_account.owner == funder.key() @ InsuranceError::TokenOwnerMismatch,
        constraint = funder_token_account.mint == pool.usdc_mint @ InsuranceError::MintMismatch,
    )]
    pub funder_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub funder: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(task_id: String, amount: u64)]
pub struct ReleaseToUser<'info> {
    #[account(mut, seeds = [POOL_SEED], bump = pool.bump)]
    pub pool: Account<'info, InsurancePool>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = pool.vault_bump,
        constraint = vault.key() == pool.vault @ InsuranceError::VaultMismatch
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == pool.usdc_mint @ InsuranceError::MintMismatch,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[event]
pub struct RefundEvent {
    pub task_id: String,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum InsuranceError {
    #[msg("Only the trusted signer can authorize refunds")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Vault account mismatch")]
    VaultMismatch,
    #[msg("Token account owner mismatch")]
    TokenOwnerMismatch,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("task_id exceeds maximum length")]
    TaskIdTooLong,
}
